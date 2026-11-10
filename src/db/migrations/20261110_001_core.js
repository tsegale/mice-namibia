"use strict";

// Core platform tables: admin users, sessions, audit trail, countries, media,
// redirects and settings. Versioned migrations replace Zusammen's
// "try { ALTER TABLE } catch {}" on every boot.

const { stamps } = require("../helpers");

exports.up = async function up(knex) {
  await knex.schema.createTable("admin_users", (t) => {
    t.increments("id").primary();
    t.string("name", 120).notNullable();
    t.string("email", 190).notNullable().unique();
    t.string("password_hash", 100).notNullable();
    t.enu("role", ["admin", "editor"]).notNullable().defaultTo("editor");
    t.integer("failed_attempts").unsigned().notNullable().defaultTo(0);
    t.datetime("locked_until").nullable();
    t.datetime("last_login_at").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    stamps(knex, t);
  });

  // express-mysql-session table, created here so its schema is versioned too.
  await knex.schema.createTable("sessions", (t) => {
    t.string("session_id", 128).primary();
    t.integer("expires").unsigned().notNullable().index();
    t.text("data", "mediumtext");
  });

  await knex.schema.createTable("audit_log", (t) => {
    t.bigIncrements("id").primary();
    t.integer("user_id").unsigned().nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    t.string("action", 40).notNullable();
    t.string("entity", 40).nullable();
    t.integer("entity_id").unsigned().nullable();
    t.string("summary", 255).nullable();
    t.string("ip", 64).nullable();
    t.datetime("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["entity", "entity_id"]);
  });

  await knex.schema.createTable("countries", (t) => {
    t.string("iso2", 2).primary();
    t.string("name", 80).notNullable();
    // Each destination has one timezone; events take it from their country.
    t.string("timezone", 64).notNullable().defaultTo("Africa/Windhoek");
    t.boolean("is_destination").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
  });

  // Every image the site shows is a media row. base_url is root-relative and
  // never includes a host, so the same value works locally, on staging and in
  // production (Zusammen stored mixed root-relative and API-host URLs).
  // Variants live at `${base_url}-${width}.${format}`.
  await knex.schema.createTable("media", (t) => {
    t.increments("id").primary();
    t.string("base_url", 255).notNullable().unique();
    t.string("widths", 60).notNullable().defaultTo("640,1280,1920");
    t.string("formats", 30).notNullable().defaultTo("webp,jpg");
    t.integer("width").unsigned().nullable();
    t.integer("height").unsigned().nullable();
    t.string("alt", 255).notNullable().defaultTo("");
    t.string("original_name", 255).nullable();
    t.string("mime", 60).nullable();
    t.integer("bytes").unsigned().nullable();
    t.boolean("is_upload").notNullable().defaultTo(true);
    t.integer("uploaded_by").unsigned().nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    t.datetime("created_at").notNullable().defaultTo(knex.fn.now());
  });

  // When a slug changes, the old URL keeps working (301). Also holds every
  // legacy .html address from the static review build.
  await knex.schema.createTable("redirects", (t) => {
    t.increments("id").primary();
    t.string("from_path", 255).notNullable().unique();
    t.string("to_path", 255).notNullable();
    t.smallint("status_code").unsigned().notNullable().defaultTo(301);
    t.datetime("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("settings", (t) => {
    t.string("key", 80).primary();
    t.text("value").notNullable();
    t.datetime("updated_at").notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  for (const table of ["settings", "redirects", "media", "countries", "audit_log", "sessions", "admin_users"]) {
    await knex.schema.dropTableIfExists(table);
  }
};
