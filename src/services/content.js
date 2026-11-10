"use strict";

// Shared write helpers for the admin content modules.

const { richText } = require("../lib/sanitize");
const { ValidationError } = require("../validation/common");
const media = require("../repositories/media");

// Rich text is cleaned on the server; an editor that submits only empty
// paragraphs counts as empty.
function cleanBody(html, field, label) {
  const clean = richText(html);
  if (!clean.replace(/<[^>]+>/g, "").trim()) throw new ValidationError({ [field]: `${label} is required.` });
  return clean;
}

// Checks every media id a form refers to really exists.
async function assertMedia(ids, field = "gallery") {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return;
  const found = await media.byIds(wanted);
  if (found.size !== wanted.length) throw new ValidationError({ [field]: "One of the photos no longer exists. Please add it again." });
}

// Replaces an ordered image list (gallery) for one parent row.
async function replaceImages(trx, table, fk, parentId, items) {
  const before = await trx(table).where(fk, parentId).pluck("media_id");
  await trx(table).where(fk, parentId).delete();
  if (items.length) {
    await trx(table).insert(items.map((g, i) => ({ [fk]: parentId, media_id: g.media_id, alt: g.alt, sort_order: i })));
  }
  return before;
}

module.exports = { cleanBody, assertMedia, replaceImages };
