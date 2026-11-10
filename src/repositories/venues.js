"use strict";

const { db } = require("../db/knex");
const media = require("./media");

function base() {
  return db()("venues as v")
    .join("countries as n", "n.iso2", "v.country_iso2")
    .leftJoin("venue_categories as vc", "vc.id", "v.category_id")
    .select("v.*", "n.name as country", "vc.name as category");
}

async function hydrate(rows, { gallery = false } = {}) {
  await media.attach(rows, "card_media_id", "card");
  await media.attach(rows, "home_media_id", "homeImage");
  if (!rows.length) return rows;
  const ids = rows.map((v) => v.id);
  const tags = await db()("venue_tag as vt").join("venue_tags as t", "t.id", "vt.tag_id").whereIn("vt.venue_id", ids).orderBy("t.sort_order").select("vt.venue_id", "t.name");
  for (const v of rows) {
    v.url = `/venues/${v.slug}`;
    v.tags = tags.filter((t) => t.venue_id === v.id).map((t) => t.name);
  }
  if (gallery) {
    const imgs = await db()("venue_images").whereIn("venue_id", ids).orderBy("sort_order");
    const map = await media.byIds(imgs.map((i) => i.media_id));
    for (const v of rows) {
      v.gallery = imgs.filter((i) => i.venue_id === v.id).map((i) => ({ media: map.get(i.media_id), alt: i.alt })).filter((g) => g.media);
    }
  }
  return rows;
}

async function published() {
  return hydrate(await base().where("v.status", "published").orderBy("v.sort_order").orderBy("v.name"));
}

async function featured() {
  return hydrate(await base().where("v.status", "published").where("v.featured_on_home", true).orderBy("v.sort_order").orderBy("v.name"));
}

async function publishedBySlug(slug) {
  const row = await base().where("v.slug", slug).where("v.status", "published").first();
  return row ? (await hydrate([row], { gallery: true }))[0] : null;
}

function categories() {
  return db()("venue_categories").orderBy("sort_order");
}

function countries() {
  return db()("countries").where({ is_destination: true }).orderBy("sort_order");
}

module.exports = { published, featured, publishedBySlug, hydrate, base, categories, countries };
