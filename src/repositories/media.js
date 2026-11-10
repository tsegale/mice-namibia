"use strict";

const { db } = require("../db/knex");

const COLUMNS = ["id", "base_url", "widths", "formats", "width", "height", "alt", "original_name", "is_upload"];

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
