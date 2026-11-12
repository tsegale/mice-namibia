"use strict";

// Health checks shared by GET /healthz (uptime monitor) and npm run doctor.
// Read-only on purpose: knex's migrate.list() can create its bookkeeping
// tables, so pending migrations are worked out by comparing the migration
// files with the rows in knex_migrations.

const fs = require("node:fs");
const path = require("node:path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");
const TIMEOUT_MS = 5000;

function migrationFiles(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort();
}

// Rejects after ms, so a hung database answers the monitor with a 503 well
// before its own request timeout instead of hanging for knex's 60 s.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function pendingMigrations(knex, dir = MIGRATIONS_DIR) {
  const hasTable = await knex.schema.hasTable("knex_migrations");
  const applied = new Set(hasTable ? (await knex("knex_migrations").select("name")).map((r) => r.name) : []);
  return migrationFiles(dir).filter((f) => !applied.has(f));
}

// Returns { ok, body } where body is exactly what /healthz sends:
// { status: "ok" | "error", db: "ok" | "down", migrations: "ok" | "pending" | "unknown" }.
// The error itself is returned separately for logging, never for the response.
async function checkHealth(knex, { timeoutMs = TIMEOUT_MS } = {}) {
  const body = { status: "error", db: "down", migrations: "unknown" };
  try {
    await withTimeout(knex.raw("SELECT 1"), timeoutMs, "database ping");
    body.db = "ok";
  } catch (err) {
    return { ok: false, body, error: err };
  }
  try {
    const pending = await withTimeout(pendingMigrations(knex), timeoutMs, "migration check");
    body.migrations = pending.length ? "pending" : "ok";
  } catch (err) {
    return { ok: false, body, error: err };
  }
  const ok = body.migrations === "ok";
  if (ok) body.status = "ok";
  return { ok, body };
}

module.exports = { checkHealth, pendingMigrations, migrationFiles, withTimeout };
