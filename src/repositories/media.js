"use strict";

const { db } = require("../db/knex");

const COLUMNS = ["id", "base_url", "file_url", "widths", "formats", "width", "height", "alt", "original_name", "is_upload"];

async function byIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await db()("media").select(COLUMNS).whereIn("id", unique);
  return new Map(rows.map((r) => [r.id, r]));
}

// rows[i][as] = media row for rows[i][field]
async function attach(rows, field, as) {
  const map = await byIds(rows.map((r) => r[field]));
  for (const r of rows) r[as] = map.get(r[field]) || null;
  return rows;
}

module.exports = { byIds, attach, COLUMNS };

/* Writes ----------------------------------------------------------------------- */

const { removeImageFiles } = require("../lib/images");
const { imageUrl } = require("../lib/picture");
const logger = require("../lib/logger");

// Every column that can point at a media row. Used to decide whether an
// uploaded image is still needed before its files are deleted.
const REFERENCES = [
  ["posts", "cover_media_id"],
  ["conferences", "cover_media_id"],
  ["conference_images", "media_id"],
  ["venues", "card_media_id"],
  ["venues", "home_media_id"],
  ["venue_images", "media_id"],
  ["speakers", "photo_media_id"],
  ["partners", "logo_media_id"],
  ["gallery_items", "media_id"],
  ["countries", "photo_media_id"],
];

async function insert(row, userId) {
  const [newId] = await db()("media").insert({ ...row, is_upload: true, uploaded_by: userId || null });
  return db()("media").select(COLUMNS).where({ id: newId }).first();
}

function forClient(m) {
  return m ? { id: m.id, base_url: m.base_url, thumb: imageUrl(m, 640), original_name: m.original_name, width: m.width, height: m.height } : null;
}

async function unreferenced(ids) {
  const out = [];
  for (const mid of [...new Set(ids.filter(Boolean))]) {
    let used = false;
    for (const [table, col] of REFERENCES) {
      if (await db()(table).where(col, mid).first()) {
        used = true;
        break;
      }
    }
    if (!used) out.push(mid);
  }
  return out;
}

// Deletes uploaded images (rows and files) that nothing uses any more.
// Images that ship with the site (/assets) are never deleted.
async function releaseIfUnused(ids) {
  const free = await unreferenced(ids);
  if (!free.length) return 0;
  const rows = await db()("media").whereIn("id", free).where({ is_upload: true });
  for (const m of rows) {
    await db()("media").where({ id: m.id }).delete();
    await removeImageFiles(m).catch((err) => logger.warn({ err, id: m.id }, "could not remove image files"));
  }
  return rows.length;
}

// Uploads that were never attached to anything (form cancelled) are removed
// after a day.
async function pruneOrphans(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  const candidates = await db()("media").where({ is_upload: true }).where("created_at", "<", cutoff).pluck("id");
  return releaseIfUnused(candidates);
}

module.exports.insert = insert;
module.exports.forClient = forClient;
module.exports.releaseIfUnused = releaseIfUnused;
module.exports.pruneOrphans = pruneOrphans;
module.exports.REFERENCES = REFERENCES;
