"use strict";

// Upload pipeline for every image added in the admin.
//
// Zusammen lessons applied:
// - Files are validated by their magic bytes, not the browser-supplied MIME type.
// - Filenames are random + ASCII slug, so no curly quotes or spaces reach the
//   disk (a curly apostrophe in a filename 404'd on the Linux server).
// - Uploads live in UPLOADS_DIR, outside the code that a deploy replaces, and
//   are referenced by a root-relative URL (/uploads/...) that works on any host.
// - Every upload becomes WebP + JPG at 640/1280/1920 (never upscaled), so a
//   10 MB phone photo is never served as-is.

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../config");
const logger = require("./logger");
const { slugify } = require("./text");

let sharp = null;
try {
  sharp = require("sharp");
  sharp.cache(false);
} catch (err) {
  logger.warn({ err: err.message }, "sharp is unavailable; uploads will be stored without resized variants");
}

const TARGET_WIDTHS = [640, 1280, 1920];

const SIGNATURES = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (b) => b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP" },
  { mime: "image/gif", ext: "gif", test: (b) => b.slice(0, 4).toString("ascii") === "GIF8" },
];

function sniff(buffer) {
  if (!buffer || buffer.length < 12) return null;
  return SIGNATURES.find((s) => s.test(buffer)) || null;
}

class UploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// Returns the row to insert into `media` (without id).
async function processImage(buffer, originalName, { uploadsDir = config.uploads.dir } = {}) {
  const kind = sniff(buffer);
  if (!kind) throw new UploadError("That file is not a JPG, PNG, WebP or GIF image.");
  if (buffer.length > config.uploads.maxBytes) {
    throw new UploadError(`Images must be smaller than ${Math.round(config.uploads.maxBytes / 1024 / 1024)} MB.`, 413);
  }

  const now = new Date();
  const dir = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"));
  const stem = `${crypto.randomBytes(6).toString("hex")}-${slugify(path.parse(originalName || "image").name, 40) || "image"}`;
  const absDir = path.join(uploadsDir, dir);
  await fs.mkdir(absDir, { recursive: true });
  const baseUrl = `/uploads/${dir.split(path.sep).join("/")}/${stem}`;
  const absBase = path.join(absDir, stem);

  if (!sharp) {
    // Degraded mode: keep the original under a single "width" so <picture>
    // still renders. Logged at boot so it is noticed.
    await fs.writeFile(`${absBase}-1280.${kind.ext}`, buffer);
    return { base_url: baseUrl, widths: "1280", formats: kind.ext, width: null, height: null, original_name: originalName, mime: kind.mime, bytes: buffer.length };
  }

  let meta;
  try {
    meta = await sharp(buffer, { failOn: "error" }).rotate().metadata();
  } catch {
    throw new UploadError("That image could not be read. Please export it again as a JPG or PNG.");
  }
  // .rotate() applies EXIF orientation, so width/height may swap.
  const portrait = meta.orientation && meta.orientation >= 5;
  const srcWidth = portrait ? meta.height : meta.width;
  const srcHeight = portrait ? meta.width : meta.height;
  let widths = TARGET_WIDTHS.filter((w) => w <= srcWidth);
  if (!widths.length) widths = [srcWidth];

  const written = [];
  try {
    for (const w of widths) {
      const pipeline = sharp(buffer).rotate().resize({ width: w, withoutEnlargement: true });
      await pipeline.clone().webp({ quality: 80 }).toFile(`${absBase}-${w}.webp`);
      written.push(`${absBase}-${w}.webp`);
      await pipeline.clone().flatten({ background: "#ffffff" }).jpeg({ quality: 80, mozjpeg: true }).toFile(`${absBase}-${w}.jpg`);
      written.push(`${absBase}-${w}.jpg`);
    }
  } catch (err) {
    await Promise.all(written.map((f) => fs.rm(f, { force: true })));
    throw err;
  }

  const fw = widths.includes(1280) ? 1280 : widths[widths.length - 1];
  return {
    base_url: baseUrl,
    widths: widths.join(","),
    formats: "webp,jpg",
    width: fw,
    height: Math.round((srcHeight / srcWidth) * fw),
    original_name: String(originalName || "").slice(0, 255),
    mime: kind.mime,
    bytes: buffer.length,
  };
}

// Deletes every variant of an uploaded image. Never touches /assets (the
// images that ship with the site).
async function removeImageFiles(media, { uploadsDir = config.uploads.dir } = {}) {
  if (!media || !media.is_upload || !String(media.base_url).startsWith("/uploads/")) return;
  const rel = media.base_url.replace(/^\/uploads\//, "");
  const absBase = path.join(uploadsDir, rel);
  if (!absBase.startsWith(path.resolve(uploadsDir) + path.sep)) return;
  const widths = String(media.widths).split(",");
  const formats = String(media.formats).split(",");
  await Promise.all(widths.flatMap((w) => formats.map((f) => fs.rm(`${absBase}-${w}.${f}`, { force: true }))));
}

module.exports = { processImage, removeImageFiles, sniff, UploadError, hasSharp: () => Boolean(sharp) };
