"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { request, createApp, resetDatabase, teardown, db } = require("./helpers");
const config = require("../src/config");
const { checkHealth } = require("../src/lib/health");
const { assetVersion, readGitSha } = require("../src/lib/version");
const { errorHandler } = require("../src/middleware/errors");

let app;
before(async () => {
  await resetDatabase();
  app = createApp();
});
after(() => teardown(app));

test("/healthz reports ok with nothing but the three fields", async () => {
  const res = await request(app).get("/healthz");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok", db: "ok", migrations: "ok" });
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["set-cookie"], undefined, "no session is created");
});

test("/healthz answers 503 while a migration is pending", async () => {
  const last = await db()("knex_migrations").orderBy("id", "desc").first();
  await db()("knex_migrations").where({ id: last.id }).del();
  try {
    const res = await request(app).get("/healthz");
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { status: "error", db: "ok", migrations: "pending" });
  } finally {
    await db()("knex_migrations").insert(last);
  }
});

test("the health check reports a database that is down, without details", async () => {
  const knex = require("knex")({ client: "mysql2", connection: { host: "127.0.0.1", port: 1, user: "nobody", database: "none" }, acquireConnectionTimeout: 2000, log: { warn() {}, error() {} } });
  try {
    const { ok, body, error } = await checkHealth(knex, { timeoutMs: 3000 });
    assert.equal(ok, false);
    assert.deepEqual(body, { status: "error", db: "down", migrations: "unknown" });
    assert.ok(error, "the cause is returned for the log, not the response");
  } finally {
    await knex.destroy();
  }
});

// A small app with only the real error handler, so an unexpected error can be
// thrown on purpose. Public HTML, admin HTML and JSON must all hide it.
function boomApp() {
  const a = express();
  a.set("view engine", "ejs");
  a.set("views", path.join(__dirname, "..", "src", "views"));
  Object.assign(a.locals, app.locals);
  a.use((req, res, next) => {
    res.locals.cspNonce = "test";
    next();
  });
  const boom = () => {
    const err = new Error("connect ECONNREFUSED db.internal:3306 password=hunter2");
    err.stack = `${err.message}\n    at Query.run (/home/app/src/repositories/posts.js:42:7)`;
    throw err;
  };
  a.get("/boom", boom);
  a.get("/admin/boom", boom);
  a.post("/boom", boom);
  a.use(errorHandler);
  return a;
}

test("error responses never include the message or stack of an unexpected error", async () => {
  const a = boomApp();
  const responses = [
    await request(a).get("/boom"),
    await request(a).get("/admin/boom"),
    await request(a).get("/admin/boom").set("Accept", "application/json"),
    await request(a).post("/boom").set("Accept", "application/json"),
  ];
  for (const res of responses) {
    assert.equal(res.status, 500);
    assert.doesNotMatch(res.text, /hunter2|ECONNREFUSED|db\.internal|posts\.js|\n\s+at /);
  }
  assert.deepEqual(responses[3].body, { error: "Something went wrong on our side. Please try again." });
});

test("CSS and JS links carry the asset version", async () => {
  const v = app.locals.assetVersion;
  assert.match(v, /^([0-9a-f]{7}|\d+\.\d+\.\d+)$/);
  const page = await request(app).get("/admin/login");
  assert.ok(page.text.includes(`/admin/admin.css?v=${v}`));
  const notFound = await request(app).get("/no-such-page");
  assert.ok(notFound.text.includes(`/css/style.css?v=${v}`));
  assert.ok(notFound.text.includes(`/js/main.js?v=${v}`));
});

test("the asset version falls back to package.json without a .git folder", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mice-version-"));
  try {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ version: "9.8.7" }));
    assert.equal(readGitSha(dir), null);
    assert.equal(assetVersion(dir), "9.8.7");
    fs.mkdirSync(path.join(dir, ".git", "refs", "heads"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    fs.writeFileSync(path.join(dir, ".git", "packed-refs"), "# pack-refs\nabcdef1234567890abcdef1234567890abcdef12 refs/heads/main\n");
    assert.equal(assetVersion(dir), "abcdef1");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("PORT accepts a port number or a socket path", () => {
  const base = { DB_NAME: "x", DB_USER: "x", SESSION_SECRET: "a".repeat(32) };
  assert.equal(config.load({ ...base, PORT: "8080" }).port, 8080);
  assert.equal(config.load({ ...base, PORT: "/tmp/passenger.sock" }).port, "/tmp/passenger.sock");
  assert.equal(config.load(base).port, 3000);
  assert.throws(() => config.load({ ...base, PORT: "70000" }), /PORT/);
});
