"use strict";

// Shared write helpers for the admin content modules.

const { richText, shortText } = require("../lib/sanitize");
const { ValidationError } = require("../validation/common");
const media = require("../repositories/media");

const isEmptyHtml = (html) => !html.replace(/<[^>]+>/g, "").trim();

// Rich text is cleaned on the server; an editor that submits only empty
// paragraphs counts as empty.
function cleanBody(html, field, label) {
  const clean = richText(html);
  if (isEmptyHtml(clean)) throw new ValidationError({ [field]: `${label} is required.` });
  return clean;
}

// The short variant (FAQ answers): paragraphs, bold, italic, links, lists.
function cleanShort(html, field, label) {
  const clean = shortText(html);
  if (isEmptyHtml(clean)) throw new ValidationError({ [field]: `${label} is required.` });
  return clean;
}

// The country must be one of the destinations in the countries table.
async function assertCountry(knex, iso2, field = "country_iso2") {
  if (!iso2) return;
  if (!(await knex("countries").where({ iso2 }).first())) throw new ValidationError({ [field]: "Choose a country from the list." });
}

// The next sort_order at the end of a list (optionally within one group).
async function nextSortOrder(knex, table, where = {}) {
  const row = await knex(table).where(where).max({ m: "sort_order" }).first();
  return row?.m == null ? 0 : Number(row.m) + 1;
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

module.exports = { cleanBody, cleanShort, assertCountry, nextSortOrder, assertMedia, replaceImages };
