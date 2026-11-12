"use strict";

const { db } = require("../db/knex");
const media = require("./media");

// Published partners in their admin order, with the logo and country name.
async function published({ marquee = false } = {}) {
  let q = db()("partners as p")
    .leftJoin("countries as c", "c.iso2", "p.country_iso2")
    .where("p.status", "published")
    .orderBy("p.sort_order")
    .orderBy("p.id")
    .select("p.*", "c.name as country_name");
  if (marquee) q = q.where("p.show_in_marquee", true);
  return media.attach(await q, "logo_media_id", "logo");
}

// Counts for the Partners page filter: per country, regional brands, all.
function counts(list) {
  const byCountry = {};
  let regional = 0;
  for (const p of list) {
    if (p.country_iso2) byCountry[p.country_iso2] = (byCountry[p.country_iso2] || 0) + 1;
    else regional++;
  }
  return { byCountry, regional, total: list.length };
}

module.exports = { published, counts };
