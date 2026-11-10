"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { ADMIN, request, createApp, resetDatabase, loggedInAgent, csrfFrom, teardown, db } = require("./helpers");

let app;
before(async () => {
  await resetDatabase();
  app = createApp();
});
after(() => teardown(app));

test("admin pages redirect to the login screen when logged out", async () => {
  const res = await request(app).get("/admin");
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/admin\/login\?next=/);
});

test("admin JSON calls get 401 instead of a redirect when logged out", async () => {
  const res = await request(app).get("/admin").set("X-Requested-With", "fetch").set("Accept", "application/json");
  assert.equal(res.status, 401);
});

test("login without the CSRF token is rejected", async () => {
  const res = await request(app).post("/admin/login").type("form").send({ email: ADMIN.email, password: ADMIN.password });
  assert.equal(res.status, 403);
});

test("wrong password shows a generic error and does not log in", async () => {
  const agent = request.agent(app);
  const page = await agent.get("/admin/login");
  const res = await agent.post("/admin/login").type("form").send({ _csrf: csrfFrom(page.text), email: ADMIN.email, password: "nope" });
  assert.equal(res.status, 401);
  assert.match(res.text, /not correct/);
  assert.equal((await agent.get("/admin")).status, 302);
});

test("unknown email gets the same message as a wrong password", async () => {
  const agent = request.agent(app);
  const page = await agent.get("/admin/login");
  const res = await agent.post("/admin/login").type("form").send({ _csrf: csrfFrom(page.text), email: "ghost@example.test", password: "whatever" });
  assert.equal(res.status, 401);
  assert.match(res.text, /not correct/);
});

test("correct login reaches the dashboard and rotates the session id", async () => {
  const agent = request.agent(app);
  const page = await agent.get("/admin/login");
  const before = /mice\.sid=([^;]+)/.exec(page.headers["set-cookie"]?.join(";") || "")?.[1];
  const res = await agent.post("/admin/login").type("form").send({ _csrf: csrfFrom(page.text), email: ADMIN.email.toUpperCase(), password: ADMIN.password, next: "/admin" });
  assert.equal(res.status, 302);
  const after = /mice\.sid=([^;]+)/.exec(res.headers["set-cookie"]?.join(";") || "")?.[1];
  assert.ok(after && after !== before, "session cookie should change on login");
  const dash = await agent.get("/admin");
  assert.equal(dash.status, 200);
  assert.match(dash.text, /Dashboard/);
});

test("the open redirect via ?next is blocked", async () => {
  const agent = request.agent(app);
  const page = await agent.get("/admin/login");
  const res = await agent.post("/admin/login").type("form").send({ _csrf: csrfFrom(page.text), email: ADMIN.email, password: ADMIN.password, next: "//evil.example" });
  assert.equal(res.headers.location, "/admin");
});

test("five wrong passwords lock the account for 15 minutes", async () => {
  const k = db();
  await k("admin_users").insert({ name: "Lock Me", email: "lock@example.test", password_hash: "$2b$10$abcdefghijklmnopqrstuuQ7v0F1yY3Yy6G9iG7oVqZ1d5M2b7Yxy", role: "editor" });
  const agent = request.agent(app);
  let last;
  for (let i = 0; i < 5; i++) {
    const page = await agent.get("/admin/login");
    last = await agent.post("/admin/login").type("form").send({ _csrf: csrfFrom(page.text), email: "lock@example.test", password: "wrong" });
  }
  assert.equal(last.status, 423);
  assert.match(last.text, /locked/);
  const row = await k("admin_users").where({ email: "lock@example.test" }).first();
  assert.ok(new Date(row.locked_until) > new Date());
});

test("logout ends the session", async () => {
  const agent = await loggedInAgent(app);
  const res = await agent.post("/admin/logout").type("form").send({ _csrf: agent.csrf });
  assert.equal(res.status, 302);
  assert.equal((await agent.get("/admin")).status, 302);
});

test("security headers are present on every response", async () => {
  const res = await request(app).get("/");
  assert.match(res.headers["content-security-policy"], /script-src 'self' 'nonce-/);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["x-robots-tag"], "noindex, nofollow");
  assert.equal(res.headers["x-powered-by"], undefined);
});
