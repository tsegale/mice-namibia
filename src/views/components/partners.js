"use strict";

const { escapeHtml: esc } = require("../../lib/text");
const { imageUrl } = require("../../lib/picture");

const dims = (m) => (m && m.width && m.height ? ` width="${m.width}" height="${m.height}"` : "");

// Partner logos are used as they are (one file, intrinsic size).
function logo(p, { lazy = false } = {}) {
  if (!p.logo) return "";
  return `<img src="${esc(imageUrl(p.logo))}" alt="${esc(p.name)}"${dims(p.logo)}${lazy ? ' loading="lazy" decoding="async"' : ""}>`;
}

function card(p) {
  const name = p.website_url ? `<a href="${esc(p.website_url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name);
  const place = p.country_iso2
    ? `<img src="/assets/images/flags/${esc(p.country_iso2)}.svg" alt="" width="20" height="15">${esc(p.country_name || p.country_iso2)}`
    : "Regional brand";
  return `<li class="partner-card" data-country="${esc(p.country_iso2 || "regional")}">
  <div class="partner-card-logo${p.dark_background ? " partner-card-logo--dark" : ""}">${logo(p, { lazy: true })}</div>
  <p class="partner-card-name">${name}</p>
  <p class="partner-card-place">${place}</p>
</li>`;
}

// The scrolling "Trusted by" strip: every logo, then the same set again
// (hidden from screen readers) so the loop is seamless.
function marquee(list) {
  const shown = list.filter((p) => p.logo);
  const visible = shown.map((p) => logo(p));
  const repeat = shown.map((p) => `<img aria-hidden="true" src="${esc(imageUrl(p.logo))}" alt=""${dims(p.logo)}>`);
  return [...visible, ...repeat].join("\n");
}

const venuesLabel = (n) => `${n} partner venue${n === 1 ? "" : "s"}`;

module.exports = { logo, card, marquee, venuesLabel };
