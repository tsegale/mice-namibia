"use strict";

// Every destination list on the site, from the destinations table in its
// admin order. The markup is the reviewed static markup.

const { escapeHtml: esc } = require("../../lib/text");
const { picture } = require("../../lib/picture");

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>';

const flag = (iso, w, h, extra = "") => `<img src="/assets/images/flags/${esc(iso)}.svg" alt="" width="${w}" height="${h}"${extra}>`;
const proposalUrl = (d) => `/contact?type=proposal&amp;destination=${esc(encodeURIComponent(d.name))}#contact-form`;

// Homepage and About mosaic: the first destination is the large tile.
function tile(d, i) {
  const feature = i === 0;
  const photo = d.photo ? picture(d.photo, { sizes: feature ? "(max-width: 720px) 100vw, 600px" : "(max-width: 720px) 50vw, 300px", alt: d.photo_alt }) : "";
  return `<li class="dest-tile${feature ? " dest-tile--feature" : ""}">
  <a href="${proposalUrl(d)}" class="dest-tile-link">
    ${photo}
    <span class="dest-tile-body">
      <span class="dest-tile-name">${flag(d.iso2, 28, 21)}${esc(d.name)}</span>
      ${d.hook ? `<span class="dest-tile-hook">${esc(d.hook)}</span>` : ""}
      <span class="dest-tile-cta">Plan an event in ${esc(d.name)} ${ARROW}</span>
    </span>
  </a>
</li>`;
}
const mosaic = (list) => list.map(tile).join("\n");

const footerFlags = (list) => list.map((d) => `<li>${flag(d.iso2, 24, 18, ' loading="lazy"')}${esc(d.name)}</li>`).join("\n");

const contactList = (list) => list.map((d) => `<li><a href="${proposalUrl(d)}">${flag(d.iso2, 24, 18)}${esc(d.name)}</a></li>`).join("\n");

// Flag tiles (Services Regional Reach, Partners filter): `sub(d)` is the
// small line under the name (towns, or the partner count).
const reachTiles = (list, sub) =>
  list
    .map(
      (d) => `<li><button type="button" class="reach-tile" data-map-iso="${esc(d.iso2)}" aria-pressed="false">
  ${flag(d.iso2, 40, 30)}
  <span class="reach-tile-name">${esc(d.name)}</span>
  <span class="reach-tile-cities">${esc(sub(d))}</span>
</button></li>`
    )
    .join("\n");

// "Namibia, Botswana, ... Uganda, and Rwanda" for running text.
function nameList(list) {
  const names = list.map((d) => esc(d.name));
  if (names.length < 3) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

module.exports = { mosaic, tile, footerFlags, contactList, reachTiles, nameList, proposalUrl };
