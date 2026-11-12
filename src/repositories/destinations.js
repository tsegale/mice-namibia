"use strict";

// Destinations are the rows of `countries` marked is_destination, in their
// admin order. They drive every destination list on the site: the homepage
// tiles, footer flags, contact form and list, venue filter, Services and
// Partners tiles, and the written-out count ("nine").

const { db } = require("../db/knex");
const media = require("./media");

async function published() {
  const rows = await db()("countries").where({ is_destination: true }).orderBy("sort_order").orderBy("iso2");
  return media.attach(rows, "photo_media_id", "photo");
}

async function all() {
  const rows = await db()("countries").orderBy("sort_order").orderBy("iso2");
  return media.attach(rows, "photo_media_id", "photo");
}

// What uses a country: venues and events (any status). A destination in use
// cannot be switched off, or those pages would lose their country.
async function usage(iso2) {
  const [venues, conferences] = await Promise.all([
    db()("venues").where({ country_iso2: iso2 }).orderBy("name").pluck("name"),
    db()("conferences").where({ country_iso2: iso2 }).orderBy("starts_at").pluck("short_title"),
  ]);
  return { venues, conferences };
}

module.exports = { published, all, usage };
