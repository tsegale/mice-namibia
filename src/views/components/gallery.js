"use strict";

const { escapeHtml: esc } = require("../../lib/text");
const { picture, largestUrl, widthsOf, variantUrl } = require("../../lib/picture");

const GRID_SIZES = "(max-width: 600px) 50vw, (max-width: 1080px) 50vw, 33vw";
const ZOOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>';

// The caption is optional; without one, the description doubles as it.
const captionOf = (g) => g.caption || g.alt;

// One photo in the Gallery page grid (opens in the lightbox).
function figure(g) {
  const cat = g.category_slug ? `<span class="gallery-item-cat">${esc(g.category_name)}</span>` : "";
  return `<figure class="gallery-item" data-category="${esc(g.category_slug || "")}">
  <a href="${esc(largestUrl(g.media))}" class="gallery-item-link" data-lightbox-item data-caption="${esc(captionOf(g))}">
    ${picture(g.media, { sizes: GRID_SIZES, alt: g.alt })}
    <span class="gallery-item-zoom" aria-hidden="true">${ZOOM}</span>
  </a>
  <figcaption>${cat}${esc(captionOf(g))}</figcaption>
</figure>`;
}

const grid = (items) => items.map(figure).join("\n");

function chips(items, categories) {
  const all = `<button type="button" class="chip-filter is-active" data-filter="all" aria-pressed="true">All photos <span>${items.length}</span></button>`;
  const each = categories.map((c) => `<button type="button" class="chip-filter" data-filter="${esc(c.slug)}" aria-pressed="false">${esc(c.name)} <span>${c.count}</span></button>`);
  return [all, ...each].join("\n");
}

// A small decorative tile in the homepage/About strip: the smallest size,
// WebP with a JPG fallback.
function stripItem(g) {
  const m = g.media;
  const widths = m ? widthsOf(m) : [];
  if (!widths.length) return "";
  const w = widths[0];
  const h = m.width && m.height ? Math.round((m.height * w) / m.width) : null;
  const formats = String(m.formats || "jpg").split(",");
  const fallback = formats.find((f) => f !== "webp") || "jpg";
  const webp = formats.includes("webp") ? `<source type="image/webp" srcset="${esc(variantUrl(m, w, "webp"))}">` : "";
  return `<picture class="gallery-strip-item">${webp}<img src="${esc(variantUrl(m, w, fallback))}" alt=""${h ? ` width="${w}" height="${h}"` : ""} loading="lazy" decoding="async"></picture>`;
}

// Two rows scrolling in opposite directions: the first half of the photos
// on top, the rest below, each row repeated once for a seamless loop.
function strip(items) {
  const tiles = items.map(stripItem).filter(Boolean);
  const half = Math.ceil(tiles.length / 2);
  const row = (list, dir) => `<div class="gallery-strip-row gallery-strip-row--${dir}"><div class="gallery-strip-track">${list.join("")}${list.join("")}</div></div>`;
  return `${row(tiles.slice(0, half), "left")}\n      ${row(tiles.slice(half), "right")}`;
}

module.exports = { figure, grid, chips, strip, stripItem, captionOf };
