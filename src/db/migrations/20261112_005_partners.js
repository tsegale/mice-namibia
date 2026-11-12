"use strict";

// Phase 3: partner logos, editable in the admin.
//
// Logos are not photos: they are kept as one file in their own format (PNG
// transparency and SVG matter), so media gains file_url, the exact address
// of a single-file image. Photo sets keep it null and use base_url + widths.

const { stamps } = require("../helpers");

exports.up = async function up(knex) {
  await knex.schema.alterTable("media", (t) => {
    t.string("file_url", 255).nullable().after("base_url");
  });

  await knex.schema.createTable("partners", (t) => {
    t.increments("id").primary();
    t.string("name", 160).notNullable();
    t.integer("logo_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
    t.string("website_url", 255).nullable();
    // null: a regional brand (no single country).
    t.string("country_iso2", 2).nullable().references("iso2").inTable("countries").onUpdate("CASCADE").onDelete("SET NULL");
    // Logos drawn in white need the navy tile (Mercure).
    t.boolean("dark_background").notNullable().defaultTo(false);
    t.boolean("show_in_marquee").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.enu("status", ["draft", "published"]).notNullable().defaultTo("draft");
    stamps(knex, t);
    t.index(["status", "sort_order"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("partners");
  await knex.schema.alterTable("media", (t) => {
    t.dropColumn("file_url");
  });
};
