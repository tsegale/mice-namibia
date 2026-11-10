"use strict";

// Phase 2A content model: conferences (events), venues, blog posts, speakers,
// plus the contact-form inbox and newsletter subscribers.
//
// Categories and tags are tables with foreign keys rather than free text, so
// renaming one can never orphan content (Zusammen's "migrate orphaned
// categories" fix). Every public entity has slug + status + timestamps.

const { stamps } = require("../helpers");

const STATUS = ["draft", "published"];

exports.up = async function up(knex) {
  /* Blog ------------------------------------------------------------------ */
  await knex.schema.createTable("post_categories", (t) => {
    t.increments("id").primary();
    t.string("name", 80).notNullable().unique();
    t.string("slug", 90).notNullable().unique();
    t.integer("sort_order").notNullable().defaultTo(0);
  });

  await knex.schema.createTable("posts", (t) => {
    t.increments("id").primary();
    t.string("slug", 160).notNullable().unique();
    t.string("title", 200).notNullable();
    t.integer("category_id").unsigned().nullable().references("id").inTable("post_categories").onDelete("SET NULL");
    t.string("excerpt", 400).notNullable().defaultTo("");
    t.text("body", "mediumtext").notNullable();
    t.integer("cover_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
    t.string("cover_alt", 255).notNullable().defaultTo("");
    t.smallint("reading_minutes").unsigned().notNullable().defaultTo(1);
    t.string("author_name", 120).notNullable().defaultTo("Zusammen Travels MICE");
    t.enu("status", STATUS).notNullable().defaultTo("draft");
    // A published post with a future published_at is scheduled: it stays
    // hidden until that moment, then appears on its own.
    t.datetime("published_at").nullable();
    t.boolean("show_on_services").notNullable().defaultTo(false);
    t.string("seo_title", 200).nullable();
    t.string("seo_description", 300).nullable();
    t.integer("created_by").unsigned().nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    t.integer("updated_by").unsigned().nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    stamps(knex, t);
    t.index(["status", "published_at"]);
  });

  /* Speakers ---------------------------------------------------------------- */
  await knex.schema.createTable("speakers", (t) => {
    t.increments("id").primary();
    t.string("slug", 160).notNullable().unique();
    t.string("name", 160).notNullable();
    t.string("role", 120).notNullable().defaultTo("");
    t.string("organisation", 160).notNullable().defaultTo("");
    t.text("bio").nullable();
    t.integer("photo_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
    t.string("linkedin_url", 255).nullable();
    t.string("website_url", 255).nullable();
    // A real person is only shown publicly once they have agreed to it.
    t.boolean("consent_confirmed").notNullable().defaultTo(false);
    // Stock "Sample" cards that preview the layout until real speakers exist.
    t.boolean("is_sample").notNullable().defaultTo(false);
    t.boolean("show_on_home").notNullable().defaultTo(false);
    t.enu("status", STATUS).notNullable().defaultTo("draft");
    t.integer("sort_order").notNullable().defaultTo(0);
    stamps(knex, t);
  });

  /* Conferences --------------------------------------------------------------- */
  await knex.schema.createTable("conferences", (t) => {
    t.increments("id").primary();
    t.string("slug", 160).notNullable().unique();
    t.string("title", 255).notNullable();
    t.string("short_title", 120).notNullable();
    // Stored in UTC. `timezone` is the IANA zone of the venue, used for every
    // date/time shown to visitors.
    t.datetime("starts_at").notNullable();
    t.datetime("ends_at").notNullable();
    t.string("timezone", 64).notNullable().defaultTo("Africa/Windhoek");
    t.string("city", 120).notNullable();
    t.string("country_iso2", 2).notNullable().references("iso2").inTable("countries").onUpdate("CASCADE");
    t.string("organiser", 200).notNullable().defaultTo("");
    t.string("excerpt", 400).notNullable().defaultTo("");
    t.text("body", "mediumtext").notNullable();
    t.text("pull_quote").nullable();
    t.integer("cover_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
    t.string("cover_alt", 255).notNullable().defaultTo("");
    t.string("registration_url", 255).nullable();
    t.boolean("featured").notNullable().defaultTo(true);
    t.boolean("images_are_stand_ins").notNullable().defaultTo(false);
    t.enu("status", STATUS).notNullable().defaultTo("draft");
    t.integer("created_by").unsigned().nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    t.integer("updated_by").unsigned().nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    stamps(knex, t);
    t.index(["status", "starts_at"]);
  });

  await knex.schema.createTable("conference_images", (t) => {
    t.increments("id").primary();
    t.integer("conference_id").unsigned().notNullable().references("id").inTable("conferences").onDelete("CASCADE");
    t.integer("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("CASCADE");
    t.string("alt", 255).notNullable().defaultTo("");
    t.integer("sort_order").notNullable().defaultTo(0);
  });

  await knex.schema.createTable("conference_speakers", (t) => {
    t.integer("conference_id").unsigned().notNullable().references("id").inTable("conferences").onDelete("CASCADE");
    t.integer("speaker_id").unsigned().notNullable().references("id").inTable("speakers").onDelete("CASCADE");
    t.integer("sort_order").notNullable().defaultTo(0);
    t.primary(["conference_id", "speaker_id"]);
  });

  /* Venues ------------------------------------------------------------------- */
  await knex.schema.createTable("venue_categories", (t) => {
    t.increments("id").primary();
    t.string("name", 120).notNullable().unique();
    t.string("slug", 130).notNullable().unique();
    t.integer("sort_order").notNullable().defaultTo(0);
  });

  // The 41 "Product Categories" from the venues brief (they double as tags).
  await knex.schema.createTable("venue_tags", (t) => {
    t.increments("id").primary();
    t.string("name", 120).notNullable().unique();
    t.string("slug", 130).notNullable().unique();
    t.integer("sort_order").notNullable().defaultTo(0);
  });

  await knex.schema.createTable("venues", (t) => {
    t.increments("id").primary();
    t.string("slug", 160).notNullable().unique();
    t.string("name", 200).notNullable();
    t.string("full_name", 255).notNullable().defaultTo("");
    t.integer("category_id").unsigned().nullable().references("id").inTable("venue_categories").onDelete("SET NULL");
    t.string("city", 120).notNullable();
    t.string("country_iso2", 2).notNullable().references("iso2").inTable("countries").onUpdate("CASCADE");
    t.text("description", "mediumtext").notNullable();
    t.string("map_query", 255).notNullable().defaultTo("");
    t.integer("card_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
    t.boolean("featured_on_home").notNullable().defaultTo(true);
    t.enu("status", STATUS).notNullable().defaultTo("draft");
    t.integer("sort_order").notNullable().defaultTo(0);
    t.integer("created_by").unsigned().nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    t.integer("updated_by").unsigned().nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    stamps(knex, t);
  });

  await knex.schema.createTable("venue_tag", (t) => {
    t.integer("venue_id").unsigned().notNullable().references("id").inTable("venues").onDelete("CASCADE");
    t.integer("tag_id").unsigned().notNullable().references("id").inTable("venue_tags").onDelete("CASCADE");
    t.primary(["venue_id", "tag_id"]);
  });

  await knex.schema.createTable("venue_images", (t) => {
    t.increments("id").primary();
    t.integer("venue_id").unsigned().notNullable().references("id").inTable("venues").onDelete("CASCADE");
    t.integer("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("CASCADE");
    t.string("alt", 255).notNullable().defaultTo("");
    t.integer("sort_order").notNullable().defaultTo(0);
  });

  /* Inbox -------------------------------------------------------------------- */
  // Every form submission is saved before any email is attempted, so a mail
  // outage can never lose an enquiry (Zusammen sent emails without awaiting
  // them and failures disappeared).
  await knex.schema.createTable("submissions", (t) => {
    t.increments("id").primary();
    t.enu("type", ["general", "proposal"]).notNullable().defaultTo("general");
    t.string("name", 160).notNullable();
    t.string("email", 190).notNullable();
    t.string("phone", 60).nullable();
    t.string("company", 160).nullable();
    t.string("subject", 200).nullable();
    t.text("message").notNullable();
    t.text("details").nullable(); // JSON: proposal fields and prefill context
    t.enu("status", ["new", "read", "replied", "archived"]).notNullable().defaultTo("new");
    t.enu("email_status", ["pending", "sent", "failed", "skipped"]).notNullable().defaultTo("pending");
    t.string("email_error", 255).nullable();
    t.string("ip", 64).nullable();
    t.string("user_agent", 255).nullable();
    stamps(knex, t);
    t.index(["status", "created_at"]);
  });

  await knex.schema.createTable("subscribers", (t) => {
    t.increments("id").primary();
    t.string("email", 190).notNullable().unique();
    t.enu("status", ["subscribed", "unsubscribed"]).notNullable().defaultTo("subscribed");
    t.string("token", 64).notNullable().unique();
    t.string("source", 120).nullable();
    t.datetime("unsubscribed_at").nullable();
    stamps(knex, t);
  });
};

exports.down = async function down(knex) {
  for (const table of [
    "subscribers",
    "submissions",
    "venue_images",
    "venue_tag",
    "venues",
    "venue_tags",
    "venue_categories",
    "conference_speakers",
    "conference_images",
    "conferences",
    "speakers",
    "posts",
    "post_categories",
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
};
