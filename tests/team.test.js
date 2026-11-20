"use strict";

// Team page: the CEO block (a settings group) and the team carousel
// (team_members). Placeholders stay until real content is published, real
// people need consent, and placeholders and real members are never mixed.

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { request, createApp, resetDatabase, loggedInAgent, csrfFrom, teardown, db } = require("./helpers");
const { run: seed } = require("../src/db/seeds");
const { hashPassword } = require("../src/services/auth");
const settings = require("../src/services/settings");

const EDITOR = { email: "editor@example.test", password: "editor-horse-42-battery" };
const PLACEHOLDER_SLIDE = "Team member coming soon";
const PLACEHOLDER_CEO = "Photo coming soon";

let app;
let admin;
let editor;
let photo;
const as = (agent) => (req) => req.set("X-CSRF-Token", agent.csrf).set("X-Requested-With", "fetch").set("Accept", "application/json");
const team = async () => (await request(app).get("/team")).text;
const carousel = (html) => html.slice(html.indexOf('id="team-carousel"'), html.indexOf("</ul>", html.indexOf('id="team-carousel"')));
const count = (html, s) => html.split(s).length - 1;
const showCeo = (agent, on) => as(agent)(agent.put("/admin/team/ceo/visibility")).send({ show_ceo: on }).expect(200);
const member = (over = {}) => ({ name: "Test Person", role: "Event Coordinator", photo_media_id: String(photo), linkedin_url: "", consent_confirmed: false, status: "draft", ...over });

before(async () => {
  await resetDatabase();
  await seed(db());
  await db()("admin_users").insert({ name: "Test Editor", email: EDITOR.email, password_hash: await hashPassword(EDITOR.password), role: "editor" });
  app = createApp();
  admin = await loggedInAgent(app);
  editor = request.agent(app);
  const page = await editor.get("/admin/login");
  await editor.post("/admin/login").type("form").send({ _csrf: csrfFrom(page.text), email: EDITOR.email, password: EDITOR.password, next: "/admin" });
  editor.csrf = csrfFrom((await editor.get("/admin")).text);
  [photo] = await db()("media").insert({ base_url: "/uploads/2026/11/portrait-test", width: 1600, height: 1200, is_upload: true });
});
beforeEach(async () => {
  await db()("team_members").delete();
  await db()("settings").whereIn("key", ["settings.ceo", "settings.team_page"]).delete();
  settings.clearCache();
});
after(() => teardown(app));

test("the Team page keeps today's placeholders while nothing is published", async () => {
  assert.equal(await db()("team_members").count({ n: "*" }).then(([r]) => Number(r.n)), 0, "the seed adds no people");
  await showCeo(editor, true);
  const html = await team();
  assert.equal(count(carousel(html), PLACEHOLDER_SLIDE), 4);
  assert.match(html, new RegExp(PLACEHOLDER_CEO));
  assert.match(html, /Name, photo and full bio to follow once confirmed by the client\./);
});

test("the Meet Our CEO section is hidden by default, placeholder and all", async () => {
  const html = await team();
  assert.doesNotMatch(html, /Meet Our CEO/);
  assert.doesNotMatch(html, new RegExp(PLACEHOLDER_CEO));
  assert.doesNotMatch(html, /Name, photo and full bio to follow/);
  assert.doesNotMatch(html, /ceo/i, "no anchor, id, class or link points at the CEO section");
  // Our Team and Speakers are unchanged, numbered on from the page header.
  assert.equal(count(carousel(html), PLACEHOLDER_SLIDE), 4);
  assert.match(html, /<span class="eyebrow-num">02<\/span>&nbsp;\/ Our Team/);
  assert.match(html, /<span class="eyebrow-num">03<\/span>&nbsp;\/ Speakers/);
  assert.match(html, /<h2 id="speakers-title">Speakers<\/h2>/);
});

test("the CEO section can be switched on and off, and stays off even when published", async () => {
  await as(editor)(editor.put("/admin/team/ceo")).send({ name: "Test Ceo", title: "Chief Executive Officer", photo_media_id: String(photo), message: "", status: "published" }).expect(200);
  assert.doesNotMatch(await team(), /Test Ceo/, "a published CEO block stays hidden while the section is off");

  await showCeo(editor, true);
  let html = await team();
  assert.match(html, /<h2 id="ceo-title">Meet Our CEO<\/h2>/);
  assert.match(html, /Test Ceo/);
  assert.match(html, /<span class="eyebrow-num">03<\/span>&nbsp;\/ Our Team/);
  assert.match(html, /<span class="eyebrow-num">04<\/span>&nbsp;\/ Speakers/);
  assert.match((await db()("audit_log").where({ entity: "settings" }).orderBy("id", "desc").first()).summary, /showed the Meet Our CEO section/);

  // Saving the CEO block again does not touch the switch.
  await as(editor)(editor.put("/admin/team/ceo")).send({ name: "Test Ceo", title: "CEO", photo_media_id: String(photo), message: "", status: "published" }).expect(200);
  assert.match(await team(), /<h2 id="ceo-title">Meet Our CEO<\/h2>/);

  await showCeo(editor, false);
  html = await team();
  assert.doesNotMatch(html, /Meet Our CEO|Test Ceo/);
  assert.match((await db()("audit_log").where({ entity: "settings" }).orderBy("id", "desc").first()).summary, /hid the Meet Our CEO section/);
});

test("the CEO switch needs a signed-in user and the CSRF token", async () => {
  assert.equal((await request(app).put("/admin/team/ceo/visibility").set("Accept", "application/json").send({ show_ceo: true })).status, 401);
  assert.equal((await editor.put("/admin/team/ceo/visibility").set("Accept", "application/json").set("X-Requested-With", "fetch").send({ show_ceo: true })).status, 403);
  assert.doesNotMatch(await team(), /Meet Our CEO/);
});

test("publishing a team member needs consent (and a photo)", async () => {
  const noConsent = await as(editor)(editor.post("/admin/team")).send(member({ status: "published" }));
  assert.equal(noConsent.status, 422);
  assert.match(noConsent.body.fieldErrors.consent_confirmed, /agreed to appear/);
  const noPhoto = await as(editor)(editor.post("/admin/team")).send(member({ status: "published", consent_confirmed: true, photo_media_id: "" }));
  assert.equal(noPhoto.status, 422);
  assert.ok(noPhoto.body.fieldErrors.photo_media_id);
  assert.equal(await db()("team_members").count({ n: "*" }).then(([r]) => Number(r.n)), 0);

  // A draft without consent is fine; it just never reaches the site.
  assert.equal((await as(editor)(editor.post("/admin/team")).send(member())).status, 201);
  const html = await team();
  assert.doesNotMatch(html, /Test Person/);
  assert.equal(count(carousel(html), PLACEHOLDER_SLIDE), 4);

  // A row published without consent (changed in the database directly)
  // still never shows.
  const row = await db()("team_members").first();
  await db()("team_members").where({ id: row.id }).update({ status: "published", consent_confirmed: false });
  assert.doesNotMatch(await team(), /Test Person/, "an unconsented row never shows, even if published in the database");

  const log = await db()("audit_log").where({ entity: "team_member" }).orderBy("id", "desc").first();
  assert.match(log.summary, /added the team member "Test Person" \(not live\)/);
});

test("real team members replace the placeholder slides and are never mixed with them", async () => {
  await as(admin)(admin.post("/admin/team")).send(member({ name: "Ana One", status: "published", consent_confirmed: true, linkedin_url: "https://www.linkedin.com/in/ana-one" })).expect(201);
  await as(admin)(admin.post("/admin/team")).send(member({ name: "Ben Two", role: "", status: "published", consent_confirmed: true })).expect(201);
  await as(admin)(admin.post("/admin/team")).send(member({ name: "Draft Three" })).expect(201);

  let slides = carousel(await team());
  assert.equal(count(slides, PLACEHOLDER_SLIDE), 0, "no placeholder slide next to real people");
  assert.equal(count(slides, '<li class="venue-slide">'), 2);
  assert.match(slides, /<h3 class="team-slide-name">Ana One<\/h3>\s*<p class="team-slide-role">Event Coordinator<\/p>/);
  assert.match(slides, /alt="Portrait of Ana One"/);
  assert.match(slides, /href="https:\/\/www\.linkedin\.com\/in\/ana-one"/);
  assert.doesNotMatch(slides, /Draft Three/);
  assert.ok(slides.indexOf("Ana One") < slides.indexOf("Ben Two"));

  // Drag order is respected.
  const ids = await db()("team_members").orderBy("sort_order").pluck("id");
  await as(admin)(admin.patch("/admin/team/reorder")).send({ ids: [ids[1], ids[0], ids[2]] }).expect(200);
  slides = carousel(await team());
  assert.ok(slides.indexOf("Ben Two") < slides.indexOf("Ana One"));

  // Unpublishing the last real member brings the placeholders back.
  await db()("team_members").update({ status: "draft" });
  assert.equal(count(carousel(await team()), PLACEHOLDER_SLIDE), 4);
});

test("the CEO block stays a placeholder until published with a name and photo", async () => {
  await showCeo(editor, true);
  const empty = await as(editor)(editor.put("/admin/team/ceo")).send({ name: "", title: "", photo_media_id: "", message: "", status: "published" });
  assert.equal(empty.status, 422);
  assert.ok(empty.body.fieldErrors.name && empty.body.fieldErrors.photo_media_id);

  await as(editor)(editor.put("/admin/team/ceo")).send({ name: "Test Ceo", title: "Chief Executive Officer", photo_media_id: String(photo), message: "First paragraph.\n\nSecond <b>paragraph</b>.", status: "draft" }).expect(200);
  assert.match(await team(), new RegExp(PLACEHOLDER_CEO), "a draft keeps the placeholder");
  assert.doesNotMatch(await team(), /Test Ceo/);

  await as(editor)(editor.put("/admin/team/ceo")).send({ name: "Test Ceo", title: "Chief Executive Officer", photo_media_id: String(photo), message: "First paragraph.\n\nSecond <b>paragraph</b>.", status: "published" }).expect(200);
  const html = await team();
  assert.doesNotMatch(html, new RegExp(PLACEHOLDER_CEO));
  assert.match(html, /<p class="ceo-name"><strong>Test Ceo<\/strong><span>Chief Executive Officer<\/span><\/p>/);
  assert.match(html, /<p>First paragraph\.<\/p>\s*<p>Second &lt;b&gt;paragraph&lt;\/b&gt;\.<\/p>/, "the message is escaped and split into paragraphs");
  assert.match(html, /alt="Portrait of Test Ceo"/);

  // The CEO photo lives only in the settings: the media clean-up keeps it.
  await db()("media").where({ id: photo }).update({ created_at: new Date(Date.now() - 3 * 86400 * 1000) });
  await require("../src/repositories/media").pruneOrphans();
  assert.ok(await db()("media").where({ id: photo }).first());

  const log = await db()("audit_log").where({ entity: "settings" }).orderBy("id", "desc").first();
  assert.match(log.summary, /changed the CEO block \(status\)/);
});

test("Pages > Team is open to editors and lists both blocks", async () => {
  const page = await editor.get("/admin/team");
  assert.equal(page.status, 200);
  assert.match(page.text, /Meet Our CEO/);
  assert.match(page.text, /Hidden on the site/);
  assert.match(page.text, /Show the Meet Our CEO section/);
  assert.doesNotMatch(page.text, /data-setting-name="show_ceo" checked/, "off by default");
  await showCeo(editor, true);
  assert.match((await editor.get("/admin/team")).text, /Placeholder on the site/);
  assert.match((await editor.get("/admin")).text, /href="\/admin\/team"/);
  assert.equal((await editor.get("/admin/team/ceo/edit")).status, 200);
});
