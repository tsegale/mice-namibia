"use strict";

// Phase 3: destinations become editable (Admin > Pages > Destinations).
//
// The countries table gains what the site shows for each destination: the
// homepage tile's hook and photo, and the towns on the Services Regional
// Reach tiles. iso2 and timezone stay fixed once a country exists.
//
// The order: the site listed the destinations as na, bw, za, zm, zw, ke, tz,
// ug, rw almost everywhere (footer, contact form and list, Partners and
// Services tiles), while the table was seeded in a slightly different order.
// Until now nobody could change it, so an install still in the original
// seeded order is moved to the site order once, here. Any other order is
// left alone.

const SEEDED = ["na", "bw", "za", "zm", "zw", "tz", "ke", "rw", "ug"];
const SITE = ["na", "bw", "za", "zm", "zw", "ke", "tz", "ug", "rw"];

exports.up = async function up(knex) {
  await knex.schema.alterTable("countries", (t) => {
    t.string("hook", 255).notNullable().defaultTo("");
    t.string("cities", 255).notNullable().defaultTo("");
    t.integer("photo_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
    t.string("photo_alt", 255).notNullable().defaultTo("");
  });

  const current = await knex("countries").orderBy("sort_order").orderBy("iso2").pluck("iso2");
  if (current.join() === SEEDED.join()) {
    for (const [i, iso2] of SITE.entries()) await knex("countries").where({ iso2 }).update({ sort_order: i });
  }
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("countries", (t) => {
    t.dropForeign(["photo_media_id"]);
    t.dropColumn("hook");
    t.dropColumn("cities");
    t.dropColumn("photo_media_id");
    t.dropColumn("photo_alt");
  });
};
