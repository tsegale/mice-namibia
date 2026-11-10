"use strict";

const slugifyLib = require("slugify");

// ASCII-only, lowercase, hyphenated. Used for URLs and upload filenames, so a
// curly apostrophe or accent can never produce a path that 404s on a
// case-sensitive Linux host (a real Zusammen production bug).
function slugify(input, maxLength = 80) {
  const s = slugifyLib(String(input || "").replace(/[‘’']/g, ""), {
    lower: true,
    strict: true,
    trim: true,
  });
  return s.slice(0, maxLength).replace(/-+$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 220 words per minute, never less than one minute.
function readingMinutes(html) {
  const words = stripTags(html).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

module.exports = { slugify, escapeHtml, stripTags, readingMinutes };
