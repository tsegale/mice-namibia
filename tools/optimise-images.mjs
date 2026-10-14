// Responsive image generator (dev-only, the site itself has no build step).
//
// Usage, from the tools/ folder after `npm install`:
//   node optimise-images.mjs <file-or-folder> [more files or folders...]
//   node optimise-images.mjs ../assets/images/venues ../assets/images/blog
//
// For every .jpg/.jpeg/.png source it writes, next to the source:
//   name-640.webp  name-1280.webp  name-1920.webp
//   name-640.jpg   name-1280.jpg   name-1920.jpg
// A width larger than the source is skipped (never upscales); if the source is
// narrower than 640px a single pair is written at the source width under the
// -640 name so every image has at least one variant. Files that already carry a
// -640/-1280/-1920 suffix are ignored, so the script is safe to re-run.
// Pass --force to regenerate variants that already exist.

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const WIDTHS = [640, 1280, 1920];
const QUALITY = 78;
const SOURCE_EXT = new Set([".jpg", ".jpeg", ".png"]);
const VARIANT_RE = /-(640|1280|1920)\.(jpe?g|webp)$/i;

const args = process.argv.slice(2);
const force = args.includes("--force");
const targets = args.filter((a) => a !== "--force");

if (targets.length === 0) {
  console.error("Usage: node optimise-images.mjs [--force] <file-or-folder> [...]");
  process.exit(1);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function collect(target, out) {
  const info = await stat(target);
  if (info.isDirectory()) {
    for (const entry of await readdir(target)) {
      await collect(path.join(target, entry), out);
    }
    return;
  }
  const ext = path.extname(target).toLowerCase();
  if (SOURCE_EXT.has(ext) && !VARIANT_RE.test(target)) out.push(target);
}

async function processImage(file) {
  const { width: sourceWidth } = await sharp(file).metadata();
  if (!sourceWidth) throw new Error(`Could not read width of ${file}`);

  const base = file.slice(0, -path.extname(file).length);
  const plan = WIDTHS.filter((w) => w <= sourceWidth).map((w) => ({ name: w, width: w }));
  if (plan.length === 0) plan.push({ name: WIDTHS[0], width: sourceWidth });

  let written = 0;
  for (const { name, width } of plan) {
    const webpOut = `${base}-${name}.webp`;
    const jpgOut = `${base}-${name}.jpg`;
    const pipeline = sharp(file).rotate().resize({ width, withoutEnlargement: true });
    if (force || !(await exists(webpOut))) {
      await pipeline.clone().webp({ quality: QUALITY }).toFile(webpOut);
      written++;
    }
    if (force || !(await exists(jpgOut))) {
      await pipeline
        .clone()
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
        .toFile(jpgOut);
      written++;
    }
  }
  return written;
}

const files = [];
for (const target of targets) await collect(path.resolve(target), files);

let failures = 0;
for (const file of files) {
  try {
    const written = await processImage(file);
    console.log(`${written ? "wrote" : "skip "} ${path.relative(process.cwd(), file)}`);
  } catch (error) {
    failures++;
    console.error(`fail  ${file}: ${error.message}`);
  }
}

console.log(`\n${files.length} source images, ${failures} failures`);
if (failures) process.exit(1);
