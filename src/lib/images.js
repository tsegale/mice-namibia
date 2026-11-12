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

// Where a new upload goes: UPLOADS_DIR/<year>/<month>/<random>-<name>.
async function newTarget(originalName, uploadsDir) {
  const now = new Date();
  const dir = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"));
  const stem = `${crypto.randomBytes(6).toString("hex")}-${slugify(path.parse(originalName || "image").name, 40) || "image"}`;
  const absDir = path.join(uploadsDir, dir);
  await fs.mkdir(absDir, { recursive: true });
  return { baseUrl: `/uploads/${dir.split(path.sep).join("/")}/${stem}`, absBase: path.join(absDir, stem) };
}

function checkSize(buffer) {
  if (buffer.length > config.uploads.maxBytes) {
    throw new UploadError(`Images must be smaller than ${Math.round(config.uploads.maxBytes / 1024 / 1024)} MB.`, 413);
  }
}

/* Logos ------------------------------------------------------------------------
   One file in the logo's own format, at most LOGO_MAX_WIDTH wide: PNG keeps
   its transparency (no JPG flattening), JPG and WebP stay as they are, GIF
   becomes PNG. SVG is accepted only after a safety check, because an SVG
   opened directly from this site could otherwise run code on it. */

const LOGO_MAX_WIDTH = 600;
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);

function looksLikeSvg(buffer) {
  const head = buffer.subarray(0, 4096).toString("utf8").replace(BOM, "").trimStart();
  return /^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE\s+svg[^>]*>\s*)?<svg[\s>]/i.test(head);
}

const SVG_REFUSED = [
  [/<script[\s>/]/i, "a script"],
  [/<foreignObject[\s>/]/i, "embedded HTML"],
  [/<(iframe|embed|object|audio|video|canvas)[\s>/]/i, "embedded content"],
  [/\son[a-z]+\s*=/i, "an event handler"],
  [/(javascript|vbscript)\s*:/i, "a script link"],
  [/data\s*:\s*(text|application)\//i, "an embedded document"],
  [/<!ENTITY|<!DOCTYPE[^>]*\[/i, "an entity declaration"],
  [/@import/i, "an external stylesheet"],
  [/url\(\s*["']?\s*(?!#)[^)]*\)/i, "an external reference"],
  [/\s(xlink:)?href\s*=\s*["']\s*(?!#|data:image\/)/i, "a link to another file"],
];

// Returns the cleaned SVG text, or throws when it contains anything active.
function cleanSvg(buffer) {
  const text = buffer.toString("utf8").replace(BOM, "");
  for (const [re, what] of SVG_REFUSED) {
    if (re.test(text)) throw new UploadError(`This SVG contains ${what}, so it was not uploaded. Export the logo again as a plain SVG or as a PNG.`);
  }
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?(?!xml\s)[\s\S]*?\?>/g, "")
    .replace(/<metadata[\s>][\s\S]*?<\/metadata>/gi, "")
    .trim();
}

async function processLogo(buffer, originalName, { uploadsDir = config.uploads.dir } = {}) {
  checkSize(buffer);
  const raster = sniff(buffer);
  const isSvg = !raster && looksLikeSvg(buffer);
  if (!raster && !isSvg) throw new UploadError("That file is not a PNG, SVG, JPG, WebP or GIF image.");
  const svg = isSvg ? Buffer.from(cleanSvg(buffer)) : null;
  const { baseUrl, absBase } = await newTarget(originalName, uploadsDir);
  const base = { base_url: baseUrl, original_name: String(originalName || "").slice(0, 255), bytes: buffer.length };

  if (isSvg) {
    let width = null;
    let height = null;
    if (sharp) {
      try {
        const meta = await sharp(svg).metadata();
        const scale = Math.min(1, LOGO_MAX_WIDTH / meta.width);
        width = Math.round(meta.width * scale);
        height = Math.round(meta.height * scale);
      } catch {
        throw new UploadError("That SVG could not be read. Export the logo again as a plain SVG or as a PNG.");
      }
    }
    await fs.writeFile(`${absBase}.svg`, svg);
    return { ...base, file_url: `${baseUrl}.svg`, widths: String(width || ""), formats: "svg", width, height, mime: "image/svg+xml" };
  }

  if (!sharp) {
    await fs.writeFile(`${absBase}.${raster.ext}`, buffer);
    return { ...base, file_url: `${baseUrl}.${raster.ext}`, widths: "", formats: raster.ext, width: null, height: null, mime: raster.mime };
  }
  let meta;
  try {
    meta = await sharp(buffer, { failOn: "error" }).metadata();
  } catch {
    throw new UploadError("That image could not be read. Please export it again as a PNG.");
  }
  const ext = raster.ext === "jpg" || raster.ext === "webp" ? raster.ext : "png";
  const pipeline = sharp(buffer).rotate().resize({ width: Math.min(LOGO_MAX_WIDTH, meta.width), withoutEnlargement: true });
  const encoded = ext === "jpg" ? pipeline.jpeg({ quality: 88, mozjpeg: true }) : ext === "webp" ? pipeline.webp({ quality: 90, alphaQuality: 100 }) : pipeline.png({ compressionLevel: 9 });
  const info = await encoded.toFile(`${absBase}.${ext}`);
  return { ...base, file_url: `${baseUrl}.${ext}`, widths: String(info.width), formats: ext, width: info.width, height: info.height, mime: ext === "jpg" ? "image/jpeg" : `image/${ext}` };
}

/* Photos ---------------------------------------------------------------------- */

// Returns the row to insert into `media` (without id).
async function processImage(buffer, originalName, { uploadsDir = config.uploads.dir, mode = "photo" } = {}) {
  if (mode === "logo") return processLogo(buffer, originalName, { uploadsDir });
  const kind = sniff(buffer);
  if (!kind) throw new UploadError("That file is not a JPG, PNG, WebP or GIF image.");
  checkSize(buffer);
  const { baseUrl, absBase } = await newTarget(originalName, uploadsDir);

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
  if (media.file_url) {
    // Single-file image (logo): one file next to base_url, with its extension.
    const ext = path.extname(String(media.file_url));
    if (/^\.(png|jpg|webp|gif|svg)$/.test(ext)) await fs.rm(`${absBase}${ext}`, { force: true });
    return;
  }
  const widths = String(media.widths).split(",");
  const formats = String(media.formats).split(",");
  await Promise.all(widths.flatMap((w) => formats.map((f) => fs.rm(`${absBase}-${w}.${f}`, { force: true }))));
}

module.exports = { processImage, processLogo, cleanSvg, removeImageFiles, sniff, UploadError, LOGO_MAX_WIDTH, hasSharp: () => Boolean(sharp) };
