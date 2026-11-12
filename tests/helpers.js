"use strict";

// Shared test setup: a separate database (DB_NAME_TEST, default mice_test),
// rebuilt from the migrations, and a logged-in supertest agent.
process.env.NODE_ENV = "test";
process.env.DB_NAME = process.env.DB_NAME_TEST || "mice_test";
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR_TEST || "storage/test-uploads";
// Never send real email from tests; tests plug in a fake transport instead.
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.MAIL_TO = "team@example.test";

const request = require("supertest");
const { db, destroy } = require("../src/db/knex");
const { createApp } = require("../src/app");
const { hashPassword } = require("../src/services/auth");

const ADMIN = { name: "Test Admin", email: "admin@example.test", password: "correct-horse-42-battery" };

async function resetDatabase() {
  const k = db();
  await k.raw("SET FOREIGN_KEY_CHECKS = 0");
  const [tables] = await k.raw("SHOW TABLES");
  for (const row of tables) await k.schema.dropTableIfExists(Object.values(row)[0]);
  await k.raw("SET FOREIGN_KEY_CHECKS = 1");
  await k.migrate.latest();
  // Reference data every page and form relies on: the destination countries
  // (the contact form validates against them).
  const { DESTINATIONS } = require("../src/db/seeds");
  await k("countries").insert(DESTINATIONS.map(([iso2, name, timezone], i) => ({ iso2, name, timezone, is_destination: true, sort_order: i })));
  await k("admin_users").insert({ name: ADMIN.name, email: ADMIN.email, password_hash: await hashPassword(ADMIN.password), role: "admin" });
}

function csrfFrom(html) {
  const m = /name="_csrf" value="([^"]+)"|name="csrf-token" content="([^"]+)"/.exec(html);
  return m && (m[1] || m[2]);
}

async function loggedInAgent(app) {
  const agent = request.agent(app);
  const page = await agent.get("/admin/login");
  const res = await agent.post("/admin/login").type("form").send({ _csrf: csrfFrom(page.text), email: ADMIN.email, password: ADMIN.password, next: "/admin" });
  if (res.status !== 302) throw new Error(`login failed in test setup (${res.status})`);
  const dash = await agent.get("/admin");
  agent.csrf = csrfFrom(dash.text);
  return agent;
}

async function teardown(app) {
  await app?.locals?.close?.();
  await destroy();
}

module.exports = { ADMIN, request, createApp, resetDatabase, loggedInAgent, csrfFrom, teardown, db };
