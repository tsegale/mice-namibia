"use strict";

// Phase 3: the photo gallery, editable in the admin.
//
// A category's slug is the filter value on the Gallery page (data-filter /
// data-category), set once so renaming a category keeps the filter working.
// Every photo needs a description (alt) before it can be published; a bulk
// upload creates drafts with an empty one, to be filled in.

const { stamps } = require("../helpers");

exports.up = async function up(knex) {
  await knex.schema.createTable("gallery_categories", (t) => {
    t.increments("id").primary();
    t.string("name", 80).notNullable();
    t.string("slug", 90).notNullable().unique();
    t.integer("sort_order").notNullable().defaultTo(0);
    stamps(knex, t);
  });

  await knex.schema.createTable("gallery_items", (t) => {
    t.increments("id").primary();
    t.integer("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("RESTRICT");
    t.string("alt", 255).notNullable().defaultTo("");
    // Optional: when empty, the description doubles as the caption.
    t.string("caption", 255).nullable();
    t.integer("category_id").unsigned().nullable().references("id").inTable("gallery_categories").onDelete("SET NULL");
    t.boolean("show_on_home").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.enu("status", ["draft", "published"]).notNullable().defaultTo("draft");
    stamps(knex, t);
    t.index(["status", "sort_order"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("gallery_items");
  await knex.schema.dropTableIfExists("gallery_categories");
};
