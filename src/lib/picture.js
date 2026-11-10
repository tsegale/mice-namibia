"use strict";

const { escapeHtml } = require("./text");

// Renders a <picture> for a media row: WebP srcset + JPG fallback, explicit
// width/height (no layout shift), lazy by default. Same markup the static
// generators produced, so the CSS keeps working unchanged.
//
// media: { base_url, widths: "640,1280,1920", formats: "webp,jpg", width, height }
function widthsOf(media) {
  return String(media.widths || "")
    .split(",")
    .map((w) => parseInt(w, 10))
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
}

function fallbackWidth(widths) {
  return widths.includes(1280) ? 1280 : widths[widths.length - 1];
}

function variantUrl(media, width, format = "jpg") {
  return `${media.base_url}-${width}.${format}`;
}

function picture(media, { sizes = "100vw", alt = "", lazy = true, priority = false, className = "", imgClass = "" } = {}) {
  if (!media || !media.base_url) return "";
  const widths = widthsOf(media);
  if (!widths.length) return "";
  const fw = fallbackWidth(widths);
  const formats = String(media.formats || "webp,jpg").split(",");
  const webp = formats.includes("webp")
    ? `<source type="image/webp" srcset="${widths.map((w) => `${variantUrl(media, w, "webp")} ${w}w`).join(", ")}" sizes="${escapeHtml(sizes)}">`
    : "";
  const fmt = formats.find((f) => f !== "webp") || "jpg";
  const jpg = widths.map((w) => `${variantUrl(media, w, fmt)} ${w}w`).join(", ");
  const dims = media.width && media.height ? ` width="${media.width}" height="${media.height}"` : "";
  const loading = priority ? ' fetchpriority="high"' : lazy ? ' loading="lazy" decoding="async"' : "";
  const cls = className ? ` class="${escapeHtml(className)}"` : "";
  const icls = imgClass ? ` class="${escapeHtml(imgClass)}"` : "";
  return `<picture${cls}>${webp}<img${icls} src="${variantUrl(media, fw, fmt)}" srcset="${jpg}" sizes="${escapeHtml(sizes)}" alt="${escapeHtml(alt)}"${dims}${loading}></picture>`;
}

// Single best URL (for Open Graph images, admin thumbnails, JSON-LD).
function imageUrl(media, prefer = 1280) {
  if (!media || !media.base_url) return "";
  const widths = widthsOf(media);
  const w = widths.includes(prefer) ? prefer : widths.filter((x) => x <= prefer).pop() || widths[0];
  return variantUrl(media, w, "jpg");
}

// Largest JPG (lightbox links, Open Graph).
function largestUrl(media) {
  if (!media || !media.base_url) return "";
  const widths = widthsOf(media);
  const fmt = String(media.formats || "jpg").split(",").find((f) => f !== "webp") || "jpg";
  return variantUrl(media, widths[widths.length - 1], fmt);
}

module.exports = { picture, imageUrl, largestUrl, widthsOf, variantUrl };
