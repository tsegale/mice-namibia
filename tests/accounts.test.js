"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { ADMIN, request, createApp, resetDatabase, loggedInAgent, csrfFrom, teardown, db } = require("./helpers");
const { hashPassword } = require("../src/services/auth");
const accounts = require("../src/services/accounts");

let app;
let admin;
let adminId;

const json = (req, agent) => req.set("Accept", "application/json").set("X-Requested-With", "fetch").set("X-CSRF-Token", agent.csrf || "");

// Logs in any account. The CSRF token comes from My account, the one page
// every signed-in user can open (even with a temporary password).
async function login(email, password) {
  const agent = request.agent(app);
  const page = await agent.get("/admin/login");
  const res = await agent.post("/admin/login").type("form").send({ _csrf: csrfFrom(page.text), email, password, next: "/admin" });
  agent.loginStatus = res.status;
  if (res.status === 302) agent.csrf = csrfFrom((await agent.get("/admin/account")).text);
  return agent;
}

async function addUser({ name, email, password, role = "editor", mustChange = false }) {
  const [id] = await db()("admin_users").insert({ name, email, role, password_hash: await hashPassword(password), must_change_password: mustChange });
  return id;
}

async function sessionCount(userId) {
  const r = await db()("sessions").whereRaw("CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.user.id')) AS UNSIGNED) = ?", [userId]).count({ n: "*" }).first();
  return Number(r.n);
}

before(async () => {
  await resetDatabase();
  app = createApp();
  admin = await loggedInAgent(app);
  adminId = (await db()("admin_users").where({ email: ADMIN.email }).first()).id;
});
after(() => teardown(app));

/* Last admin guard rails (run first, while the test admin is the only admin) ---------- */

test("the last active admin cannot be demoted, deactivated or deleted", async () => {
  const demote = await json(admin.put(`/admin/users/${adminId}`), admin).send({ role: "editor" });
  assert.equal(demote.status, 422, demote.text);
  assert.match(demote.body.fieldErrors.role, /at least one active admin/);

  const deactivate = await json(admin.post(`/admin/users/${adminId}/active`), admin).send({ is_active: false });
  assert.equal(deactivate.status, 422);
  const del = await json(admin.delete(`/admin/users/${adminId}`), admin);
  assert.equal(del.status, 422);

  const row = await db()("admin_users").where({ id: adminId }).first();
  assert.equal(row.role, "admin");
  assert.equal(Boolean(row.is_active), true);

  // The service refuses it even when another (non-admin) actor asks.
  const target = await db()("admin_users").where({ id: adminId }).first();
  await assert.rejects(accounts.changeRole(9999, target, "editor"), /at least one active admin/);
  await assert.rejects(accounts.setActive(9999, target, false), /at least one active admin/);
});

test("with a second admin you still cannot demote yourself, but can demote them", async () => {
  const otherId = await addUser({ name: "Second Admin", email: "second@example.test", password: "second-admin-pass-77", role: "admin" });
  const self = await json(admin.put(`/admin/users/${adminId}`), admin).send({ role: "editor" });
  assert.equal(self.status, 422);
  assert.match(self.body.fieldErrors.role, /your own admin role/);

  const other = await json(admin.put(`/admin/users/${otherId}`), admin).send({ role: "editor" });
  assert.equal(other.status, 200, other.text);
  assert.equal((await db()("admin_users").where({ id: otherId }).first()).role, "editor");
  const log = await db()("audit_log").where({ action: "role_change", entity_id: otherId }).first();
  assert.ok(log, "role change is audited");

  const badRole = await json(admin.put(`/admin/users/${otherId}`), admin).send({ role: "owner" });
  assert.equal(badRole.status, 422);
  assert.match(badRole.body.fieldErrors.role, /Admin or Editor/);
});

/* My account -------------------------------------------------------------------------- */

test("changing your name and email is saved and audited, duplicates are refused", async () => {
  const agent = await login("second@example.test", "second-admin-pass-77");
  const taken = await json(agent.put("/admin/account"), agent).send({ name: "Second", email: ADMIN.email.toUpperCase() });
  assert.equal(taken.status, 422);
  assert.match(taken.body.fieldErrors.email, /already uses/);

  const ok = await json(agent.put("/admin/account"), agent).send({ name: "Second Person", email: "Second.Person@Example.test" });
  assert.equal(ok.status, 200, ok.text);
  const row = await db()("admin_users").where({ email: "second.person@example.test" }).first();
  assert.equal(row.name, "Second Person");
  const log = await db()("audit_log").where({ action: "update", entity: "admin_user", entity_id: row.id }).first();
  assert.match(log.summary, /changed their own name and email/);
  assert.match((await agent.get("/admin/account")).text, /Second Person/);
});

test("a password change needs the current password", async () => {
  const id = await addUser({ name: "Pat Editor", email: "pat@example.test", password: "pat-original-pass-1" });
  const agent = await login("pat@example.test", "pat-original-pass-1");
  const res = await json(agent.post("/admin/account/password"), agent).send({ current_password: "not-my-password-9", new_password: "a-brand-new-pass-22", confirm_password: "a-brand-new-pass-22" });
  assert.equal(res.status, 422);
  assert.match(res.body.fieldErrors.current_password, /not your current password/);
  const missing = await json(agent.post("/admin/account/password"), agent).send({ new_password: "a-brand-new-pass-22", confirm_password: "a-brand-new-pass-22" });
  assert.equal(missing.status, 422);
  assert.ok(missing.body.fieldErrors.current_password);
  assert.equal((await login("pat@example.test", "pat-original-pass-1")).loginStatus, 302, "old password still works");
  assert.equal(await db()("audit_log").where({ action: "password_change", entity_id: id }).first(), undefined);
});

test("weak or mismatched new passwords are rejected", async () => {
  const agent = await login("pat@example.test", "pat-original-pass-1");
  const send = (body) => json(agent.post("/admin/account/password"), agent).send({ current_password: "pat-original-pass-1", ...body });

  const short = await send({ new_password: "short1", confirm_password: "short1" });
  assert.equal(short.status, 422);
  assert.match(short.body.fieldErrors.new_password, /at least 12 characters/);

  const letters = await send({ new_password: "onlylettershere", confirm_password: "onlylettershere" });
  assert.match(letters.body.fieldErrors.new_password, /letters and numbers/);

  const same = await send({ new_password: "pat-original-pass-1", confirm_password: "pat-original-pass-1" });
  assert.match(same.body.fieldErrors.new_password, /different from the current/);

  const mismatch = await send({ new_password: "a-brand-new-pass-22", confirm_password: "a-brand-new-pass-23" });
  assert.equal(mismatch.status, 422);
  assert.match(mismatch.body.fieldErrors.confirm_password, /do not match/);
});

test("changing your password signs out your other devices and rotates this session", async () => {
  const id = (await db()("admin_users").where({ email: "pat@example.test" }).first()).id;
  const laptop = await login("pat@example.test", "pat-original-pass-1");
  const phone = await login("pat@example.test", "pat-original-pass-1");
  assert.equal((await phone.get("/admin")).status, 200);
  assert.ok((await sessionCount(id)) >= 2);

  const res = await json(laptop.post("/admin/account/password"), laptop).send({ current_password: "pat-original-pass-1", new_password: "a-brand-new-pass-22", confirm_password: "a-brand-new-pass-22" });
  assert.equal(res.status, 200, res.text);
  assert.match(res.body.message, /other devices have been signed out/);
  assert.ok(/mice\.sid=/.test(res.headers["set-cookie"]?.join(";") || ""), "a new session cookie is issued");

  assert.equal((await laptop.get("/admin")).status, 200, "this browser stays signed in");
  const phoneRes = await phone.get("/admin");
  assert.equal(phoneRes.status, 302);
  assert.match(phoneRes.headers.location, /^\/admin\/login/);
  assert.equal(await sessionCount(id), 1);

  assert.equal((await login("pat@example.test", "pat-original-pass-1")).loginStatus, 401);
  assert.equal((await login("pat@example.test", "a-brand-new-pass-22")).loginStatus, 302);
  const log = await db()("audit_log").where({ action: "password_change", entity_id: id }).first();
  assert.match(log.summary, /signed out \d+ other session/);
});

/* Editors ----------------------------------------------------------------------------- */

test("editors get 403 on Users and do not see it in the menu", async () => {
  const editor = await login("pat@example.test", "a-brand-new-pass-22");
  const page = await editor.get("/admin/users");
  assert.equal(page.status, 403);
  assert.match(page.text, /Not allowed/);
  const panel = await editor.get("/admin/users/new");
  assert.equal(panel.status, 403);
  const create = await json(editor.post("/admin/users"), editor).send({ name: "Sneaky", email: "sneaky@example.test", role: "admin", temporary_password: "Abcdefgh2345jkmn" });
  assert.equal(create.status, 403);
  assert.equal(await db()("admin_users").where({ email: "sneaky@example.test" }).first(), undefined);

  const dash = await editor.get("/admin");
  assert.equal(dash.status, 200);
  assert.doesNotMatch(dash.text, /href="\/admin\/users"/);
  assert.match((await admin.get("/admin")).text, /href="\/admin\/users"/, "admins do see it");
});

test("editors can still use every content and inbox page", async () => {
  const editor = await login("pat@example.test", "a-brand-new-pass-22");
  const pages = [
    "/admin",
    "/admin/account",
    "/admin/conferences",
    "/admin/conferences/new",
    "/admin/venues",
    "/admin/venues/new",
    "/admin/posts",
    "/admin/posts/new",
    "/admin/speakers",
    "/admin/speakers/new",
    "/admin/submissions",
    "/admin/submissions/export.csv",
    "/admin/subscribers",
    "/admin/subscribers/export.csv",
  ];
  for (const url of pages) {
    const res = await editor.get(url);
    assert.equal(res.status, 200, `${url} returned ${res.status}`);
  }
  const speaker = await json(editor.post("/admin/speakers"), editor).send({ name: "Editor Draft", status: "draft", sort_order: 0 });
  assert.equal(speaker.status, 201, speaker.text);
});

test("a role change applies to a signed-in user straight away", async () => {
  const id = await addUser({ name: "Promote Me", email: "promote@example.test", password: "promote-me-pass-31" });
  const agent = await login("promote@example.test", "promote-me-pass-31");
  assert.equal((await agent.get("/admin/users")).status, 403);
  assert.equal((await json(admin.put(`/admin/users/${id}`), admin).send({ role: "admin" })).status, 200);
  assert.equal((await agent.get("/admin/users")).status, 200);
});

/* Deactivate, unlock, reset ----------------------------------------------------------- */

test("a deactivated user loses their session and cannot log in", async () => {
  const id = await addUser({ name: "Leaving Soon", email: "leaving@example.test", password: "leaving-soon-pass-4" });
  const agent = await login("leaving@example.test", "leaving-soon-pass-4");
  assert.equal((await agent.get("/admin")).status, 200);

  const res = await json(admin.post(`/admin/users/${id}/active`), admin).send({ is_active: false });
  assert.equal(res.status, 200, res.text);
  assert.equal(await sessionCount(id), 0, "sessions are deleted immediately");
  assert.equal((await agent.get("/admin")).status, 302);
  assert.equal((await json(agent.get("/admin/posts"), agent)).status, 401);

  const again = await login("leaving@example.test", "leaving-soon-pass-4");
  assert.equal(again.loginStatus, 401);
  assert.ok(await db()("audit_log").where({ action: "deactivate", entity_id: id }).first());

  assert.equal((await json(admin.post(`/admin/users/${id}/active`), admin).send({ is_active: true })).status, 200);
  assert.equal((await login("leaving@example.test", "leaving-soon-pass-4")).loginStatus, 302);
});

test("you cannot deactivate or delete yourself", async () => {
  const deactivate = await json(admin.post(`/admin/users/${adminId}/active`), admin).send({ is_active: false });
  assert.equal(deactivate.status, 422);
  assert.match(deactivate.body.error, /your own account/);
  const del = await json(admin.delete(`/admin/users/${adminId}`), admin);
  assert.equal(del.status, 422);
  assert.match(del.body.error, /your own account/);
});

test("unlock clears the failed attempts and the lock", async () => {
  const id = await addUser({ name: "Locked Out", email: "locked@example.test", password: "locked-out-pass-55" });
  await db()("admin_users").where({ id }).update({ failed_attempts: 0, locked_until: new Date(Date.now() + 10 * 60000) });
  assert.equal((await login("locked@example.test", "locked-out-pass-55")).loginStatus, 423);
  const list = await admin.get("/admin/users");
  assert.match(list.text, /badge-failed">Locked/);

  const res = await json(admin.post(`/admin/users/${id}/unlock`), admin).send({});
  assert.equal(res.status, 200);
  const row = await db()("admin_users").where({ id }).first();
  assert.equal(row.failed_attempts, 0);
  assert.equal(row.locked_until, null);
  assert.equal((await login("locked@example.test", "locked-out-pass-55")).loginStatus, 302);
});

test("deleting a user removes the account and their sessions", async () => {
  const id = await addUser({ name: "Delete Me", email: "delete@example.test", password: "delete-me-pass-66" });
  const agent = await login("delete@example.test", "delete-me-pass-66");
  const res = await json(admin.delete(`/admin/users/${id}`), admin);
  assert.equal(res.status, 200, res.text);
  assert.equal(await db()("admin_users").where({ id }).first(), undefined);
  assert.equal(await sessionCount(id), 0);
  assert.equal((await agent.get("/admin")).status, 302);
});

/* Temporary passwords ----------------------------------------------------------------- */

test("a new user gets a temporary password and must set their own before anything else", async () => {
  const form = await admin.get("/admin/users/new");
  assert.equal(form.status, 200);
  const temp = /name="temporary_password" value="([^"]+)"/.exec(form.text)[1];
  assert.equal(temp.length, 16);
  assert.match(form.text, /data-copy="#f-temporary_password"/);
  assert.notEqual(temp, /name="temporary_password" value="([^"]+)"/.exec((await admin.get("/admin/users/new")).text)[1], "a new one every time");

  const weak = await json(admin.post("/admin/users"), admin).send({ name: "New Person", email: "new@example.test", role: "editor", temporary_password: "short" });
  assert.equal(weak.status, 422);
  assert.ok(weak.body.fieldErrors.temporary_password);

  const created = await json(admin.post("/admin/users"), admin).send({ name: "New Person", email: "New@Example.test", role: "editor", temporary_password: temp });
  assert.equal(created.status, 201, created.text);
  const row = await db()("admin_users").where({ email: "new@example.test" }).first();
  assert.equal(Boolean(row.must_change_password), true);
  assert.notEqual(row.password_hash, temp);
  assert.ok(await db()("audit_log").where({ action: "create", entity: "admin_user", entity_id: row.id }).first());

  const dup = await json(admin.post("/admin/users"), admin).send({ name: "Again", email: "new@example.test", role: "editor", temporary_password: temp });
  assert.equal(dup.status, 422);
  assert.match(dup.body.fieldErrors.email, /already exists/);

  const agent = await login("new@example.test", temp);
  assert.equal(agent.loginStatus, 302);
  for (const url of ["/admin", "/admin/posts", "/admin/submissions"]) {
    const res = await agent.get(url);
    assert.equal(res.status, 302, url);
    assert.equal(res.headers.location, "/admin/account");
  }
  assert.equal((await json(agent.post("/admin/speakers"), agent).send({ name: "X", status: "draft" })).status, 403);
  const account = await agent.get("/admin/account");
  assert.equal(account.status, 200);
  assert.match(account.text, /Choose your own password to continue/);

  const changed = await json(agent.post("/admin/account/password"), agent).send({ current_password: temp, new_password: "my-own-password-88", confirm_password: "my-own-password-88" });
  assert.equal(changed.status, 200, changed.text);
  assert.equal(changed.body.redirect, "/admin");
  assert.equal((await agent.get("/admin")).status, 200);
  assert.equal(Boolean((await db()("admin_users").where({ id: row.id }).first()).must_change_password), false);
});

test("an admin password reset signs the user out and forces a new password", async () => {
  const row = await db()("admin_users").where({ email: "new@example.test" }).first();
  const agent = await login("new@example.test", "my-own-password-88");
  assert.equal((await agent.get("/admin")).status, 200);

  const panel = await admin.get(`/admin/users/${row.id}/password`);
  const temp = /name="temporary_password" value="([^"]+)"/.exec(panel.text)[1];
  const res = await json(admin.post(`/admin/users/${row.id}/password`), admin).send({ temporary_password: temp });
  assert.equal(res.status, 200, res.text);
  assert.equal(await sessionCount(row.id), 0);
  assert.equal((await agent.get("/admin")).status, 302);
  assert.equal((await login("new@example.test", "my-own-password-88")).loginStatus, 401);

  const fresh = await login("new@example.test", temp);
  assert.equal((await fresh.get("/admin")).headers.location, "/admin/account");
  assert.ok(await db()("audit_log").where({ action: "password_reset", entity_id: row.id }).first());

  const own = await json(admin.post(`/admin/users/${adminId}/password`), admin).send({ temporary_password: temp });
  assert.equal(own.status, 422, "your own password is changed on My account");
});

test("the Users page lists every account with its status", async () => {
  const res = await admin.get("/admin/users");
  assert.equal(res.status, 200);
  for (const text of [ADMIN.email, "pat@example.test", "(you)", "Temporary password", "Last login", "Locked until"]) assert.ok(res.text.includes(text), `missing ${text}`);
  assert.doesNotMatch(res.text, /password_hash|\$2[aby]\$/);
});
