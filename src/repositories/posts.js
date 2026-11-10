"use strict";

const { db } = require("../db/knex");
const media = require("./media");

function base() {
  return db()("posts as p")
    .leftJoin("post_categories as pc", "pc.id", "p.category_id")
    .select("p.*", "pc.name as category", "pc.slug as category_slug");
}

// Live = published and its publish time has arrived (future = scheduled).
function live(q) {
  return q.where("p.status", "published").where("p.published_at", "<=", new Date());
}

async function hydrate(rows) {
  await media.attach(rows, "cover_media_id", "cover");
  for (const p of rows) p.url = `/blog/${p.slug}`;
  return rows;
}

async function published() {
  return hydrate(await live(base()).orderBy("p.published_at", "desc").orderBy("p.id", "desc"));
}

async function publishedBySlug(slug) {
  const row = await live(base()).where("p.slug", slug).first();
  return row ? (await hydrate([row]))[0] : null;
}

module.exports = { published, publishedBySlug, hydrate, base, live };
