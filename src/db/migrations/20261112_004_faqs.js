"use strict";

// Phase 3: FAQs, editable in the admin instead of hard-coded in the page.
//
// Groups carry a slug because it is the page anchor (/faq#faq-planning) and
// the topic jump target, so it must not change when a group is renamed.
// A question with a country shows that country's flag (destination questions).

const { stamps } = require("../helpers");

exports.up = async function up(knex) {
  await knex.schema.createTable("faq_groups", (t) => {
    t.increments("id").primary();
    t.string("name", 120).notNullable();
    t.string("slug", 120).notNullable().unique();
    t.integer("sort_order").notNullable().defaultTo(0);
    stamps(knex, t);
  });

  await knex.schema.createTable("faqs", (t) => {
    t.increments("id").primary();
    // A group with questions in it cannot be deleted by accident.
    t.integer("group_id").unsigned().notNullable().references("id").inTable("faq_groups").onDelete("RESTRICT");
    t.string("question", 255).notNullable();
    // Short rich text: paragraphs, bold, italic, links and lists (sanitised on save).
    t.text("answer").notNullable();
    t.string("country_iso2", 2).nullable().references("iso2").inTable("countries").onUpdate("CASCADE").onDelete("SET NULL");
    t.boolean("show_on_home").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.enu("status", ["draft", "published"]).notNullable().defaultTo("draft");
    stamps(knex, t);
    t.index(["group_id", "sort_order"]);
    t.index(["status", "show_on_home"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("faqs");
  await knex.schema.dropTableIfExists("faq_groups");
};
