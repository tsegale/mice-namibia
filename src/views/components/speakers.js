"use strict";

const { escapeHtml: esc } = require("../../lib/text");
const { picture } = require("../../lib/picture");

const SIZES = "(max-width: 720px) 100vw, (max-width: 900px) 50vw, 280px";

function card(s) {
  const sub = [s.role, s.organisation].filter(Boolean).join(", ");
  const photo = s.photo
    ? picture(s.photo, { sizes: SIZES, alt: s.is_sample ? "" : `Portrait of ${s.name}` })
    : "";
  return `<div class="speaker-card">
  <div class="speaker-card-media${photo ? "" : " image-placeholder"}">
    ${photo || OPEN_ICON}
    ${s.is_sample ? '<span class="speaker-sample-badge">Sample</span>' : ""}
  </div>
  <div class="speaker-card-body">
    <h3>${esc(s.name)}</h3>
    ${sub ? `<span>${esc(sub)}</span>` : ""}
  </div>
</div>`;
}

const OPEN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>';

const OPEN_SLOT = `<div class="speaker-card">
  <div class="speaker-card-media image-placeholder">
    ${OPEN_ICON}
  </div>
  <div class="speaker-card-body">
    <h3>Speaker slot open</h3>
    <span>Awaiting confirmation</span>
  </div>
</div>`;

function grid(speakers, { slots = 0 } = {}) {
  const open = Math.max(0, slots - speakers.length);
  return speakers.map(card).join("\n") + (open ? "\n" + Array(open).fill(OPEN_SLOT).join("\n") : "");
}

module.exports = { card, grid };
