"use strict";

const { db } = require("../db/knex");
const media = require("./media");
const { isoInZone } = require("../lib/dates");

function base() {
  return db()("conferences as c").join("countries as n", "n.iso2", "c.country_iso2").select("c.*", "n.name as country");
}

// Shape used by the page components (same fields the static generator used).
async function hydrate(rows, { gallery = false } = {}) {
  await media.attach(rows, "cover_media_id", "cover");
  for (const c of rows) {
    c.url = `/events/${c.slug}`;
    c.starts_iso = isoInZone(c.starts_at, c.timezone);
    c.ends_iso = isoInZone(c.ends_at, c.timezone);
  }
  if (gallery && rows.length) {
    const imgs = await db()("conference_images").whereIn("conference_id", rows.map((c) => c.id)).orderBy("sort_order");
    const map = await media.byIds(imgs.map((i) => i.media_id));
    for (const c of rows) {
      c.gallery = imgs.filter((i) => i.conference_id === c.id).map((i) => ({ media: map.get(i.media_id), alt: i.alt })).filter((g) => g.media);
    }
  }
  return rows;
}

// Published and not yet over, soonest first.
async function upcoming({ limit } = {}) {
  let q = base().where("c.status", "published").where("c.ends_at", ">=", new Date()).orderBy("c.starts_at");
  if (limit) q = q.limit(limit);
  return hydrate(await q);
}

async function publishedBySlug(slug) {
  const row = await base().where("c.slug", slug).where("c.status", "published").first();
  if (!row) return null;
  const [c] = await hydrate([row], { gallery: true });
  return c;
}

module.exports = { upcoming, publishedBySlug, hydrate, base };
