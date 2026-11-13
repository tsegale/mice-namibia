"use strict";

// Phase 3: the Privacy Policy and Terms and Conditions as versioned markdown.
// A version is never edited or deleted: publishing adds a new one and points
// the document at it. The app has no code path that updates or deletes a
// version row, and the foreign key from versions to documents is RESTRICT,
// so a document can never be deleted out from under its history.

exports.up = async function up(knex) {
  await knex.schema.createTable("legal_documents", (t) => {
    t.increments("id").primary();
    t.string("slug", 60).notNullable().unique();
    t.string("title", 160).notNullable();
    // Set once the first version exists (foreign key added below).
    t.integer("current_version_id").unsigned().nullable();
    t.datetime("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("legal_document_versions", (t) => {
    t.increments("id").primary();
    t.integer("document_id").unsigned().notNullable().references("id").inTable("legal_documents").onDelete("RESTRICT");
    // 1, 2, 3 ... per document, for readable addresses (/privacy-policy/versions/2).
    t.integer("version_number").unsigned().notNullable();
    t.specificType("markdown", "MEDIUMTEXT").notNullable();
    t.date("effective_date").notNullable();
    t.integer("published_by").unsigned().nullable().references("id").inTable("admin_users").onDelete("SET NULL");
    t.datetime("published_at").notNullable().defaultTo(knex.fn.now());
    t.string("note", 500).notNullable();
    t.unique(["document_id", "version_number"]);
  });

  await knex.schema.alterTable("legal_documents", (t) => {
    t.foreign("current_version_id").references("id").inTable("legal_document_versions").onDelete("RESTRICT");
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("legal_documents", (t) => {
    t.dropForeign(["current_version_id"]);
  });
  await knex.schema.dropTableIfExists("legal_document_versions");
  await knex.schema.dropTableIfExists("legal_documents");
};
