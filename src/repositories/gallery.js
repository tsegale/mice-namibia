"use strict";

const { db } = require("../db/knex");
const media = require("./media");

// Published photos in their admin order, with the image and category.
async function published({ home = false } = {}) {
  let q = db()("gallery_items as g")
    .leftJoin("gallery_categories as c", "c.id", "g.category_id")
    .where("g.status", "published")
    .orderBy("g.sort_order")
    .orderBy("g.id")
    .select("g.*", "c.name as category_name", "c.slug as category_slug");
  if (home) q = q.where("g.show_on_home", true);
  return media.attach(await q, "media_id", "media");
}

// Category chips for the Gallery page: categories that have published
// photos, in their admin order, with their counts.
async function categories(items) {
  const rows = await db()("gallery_categories").orderBy("sort_order").orderBy("id");
  return rows.map((c) => ({ ...c, count: items.filter((i) => i.category_id === c.id).length })).filter((c) => c.count);
}

module.exports = { published, categories };
