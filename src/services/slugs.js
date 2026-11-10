"use strict";

const { db } = require("../db/knex");
const { slugify } = require("../lib/text");

// Returns a slug that is free in `table`, adding -2, -3 ... when needed.
async function uniqueSlug(table, wanted, { excludeId = null, trx = db() } = {}) {
  const base = slugify(wanted, 80) || "item";
  let candidate = base;
  for (let n = 2; ; n++) {
    let q = trx(table).where({ slug: candidate });
    if (excludeId) q = q.whereNot({ id: excludeId });
    if (!(await q.first())) return candidate;
    candidate = `${base}-${n}`;
  }
}

module.exports = { uniqueSlug };
