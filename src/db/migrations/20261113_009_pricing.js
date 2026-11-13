"use strict";

// Phase 3: ticket tiers (Pages > Pricing) and per-conference prices (edited
// in the conference panel). Prices are integer cents; a tier without a price
// for a conference shows "Price on request".

const { stamps } = require("../helpers");

exports.up = async function up(knex) {
  await knex.schema.createTable("pricing_tiers", (t) => {
    t.increments("id").primary();
    t.string("name", 80).notNullable();
    t.string("tagline", 255).notNullable().defaultTo("");
    // JSON array of strings, in display order.
    t.text("features").notNullable();
    // The "Most popular" card.
    t.boolean("highlighted").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.enu("status", ["draft", "published"]).notNullable().defaultTo("draft");
    stamps(knex, t);
    t.index(["status", "sort_order"]);
  });

  await knex.schema.createTable("conference_prices", (t) => {
    t.increments("id").primary();
    t.integer("conference_id").unsigned().notNullable().references("id").inTable("conferences").onDelete("CASCADE");
    t.integer("tier_id").unsigned().notNullable().references("id").inTable("pricing_tiers").onDelete("CASCADE");
    t.integer("amount_cents").unsigned().notNullable();
    t.string("currency", 3).notNullable().defaultTo("NAD");
    stamps(knex, t);
    t.unique(["conference_id", "tier_id"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("conference_prices");
  await knex.schema.dropTableIfExists("pricing_tiers");
};
