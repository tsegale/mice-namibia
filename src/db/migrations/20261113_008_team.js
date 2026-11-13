"use strict";

// Phase 3: the team carousel on the Team page. Real people only: a member is
// shown once published AND their consent to appear is confirmed. Until the
// first one is live the page keeps its "coming soon" slides (never mixed).
// The CEO block is a settings group ("settings.ceo"), not a row here.

const { stamps } = require("../helpers");

exports.up = async function up(knex) {
  await knex.schema.createTable("team_members", (t) => {
    t.increments("id").primary();
    t.string("name", 160).notNullable();
    t.string("role", 120).notNullable().defaultTo("");
    t.integer("photo_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
    t.string("linkedin_url", 255).nullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.enu("status", ["draft", "published"]).notNullable().defaultTo("draft");
    t.boolean("consent_confirmed").notNullable().defaultTo(false);
    stamps(knex, t);
    t.index(["status", "sort_order"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("team_members");
};
