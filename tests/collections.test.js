"use strict";

// Phase 3 collections: FAQs, partners and gallery, managed in the admin and
// rendered on the public pages exactly as the reviewed static markup was.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { request, createApp, resetDatabase, loggedInAgent, csrfFrom, teardown, db } = require("./helpers");
const { run: seed } = require("../src/db/seeds");
const { hashPassword } = require("../src/services/auth");
const config = require("../src/config");

const DATA = path.join(__dirname, "..", "content", "data");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
const EDITOR = { name: "Test Editor", email: "editor@example.test", password: "editor-horse-42-battery" };

let app;
let admin;
let editor;
const as = (agent) => (req) => req.set("X-CSRF-Token", agent.csrf).set("X-Requested-With", "fetch").set("Accept", "application/json");

async function loginAs(user) {
  const agent = request.agent(app);
  const page = await agent.get("/admin/login");
  const res = await agent.post("/admin/login").type("form").send({ _csrf: csrfFrom(page.text), email: user.email, password: user.password, next: "/admin" });
  assert.equal(res.status, 302, `login as ${user.email}`);
  agent.csrf = csrfFrom((await agent.get("/admin")).text);
  return agent;
}

before(async () => {
  fs.rmSync(config.uploads.dir, { recursive: true, force: true });
  await resetDatabase();
  await seed(db());
  await db()("admin_users").insert({ name: EDITOR.name, email: EDITOR.email, password_hash: await hashPassword(EDITOR.password), role: "editor" });
  app = createApp();
  admin = await loggedInAgent(app);
  editor = await loginAs(EDITOR);
});
after(async () => {
  fs.rmSync(config.uploads.dir, { recursive: true, force: true });
  await teardown(app);
});

const count = async (table) => Number((await db()(table).count({ n: "*" }).first()).n);
const homeFaqList = (html) => html.slice(html.indexOf('class="home-faq-list"'), html.indexOf("home-faq-more"));

/* FAQs ------------------------------------------------------------------------- */

const faqOrder = () =>
  db()("faqs as f")
    .join("faq_groups as g", "g.id", "f.group_id")
    .orderBy([{ column: "g.sort_order" }, { column: "f.sort_order" }])
    .select("g.slug", "f.question");

test("FAQ seed matches the reviewed page, keeps its order and is safe to re-run", async () => {
  const { groups } = readJson("faqs.json");
  const expected = groups.flatMap((g) => g.faqs.map((f) => ({ slug: g.slug, question: f.question })));
  assert.deepEqual(await faqOrder(), expected);
  assert.equal(await count("faqs"), 30);

  await seed(db());
  assert.equal(await count("faqs"), 30, "a second run adds nothing");
  assert.deepEqual(await faqOrder(), expected, "and keeps the order");

  // Deleted on purpose in the admin: a later seed run must not bring it back.
  const victim = await db()("faqs").where({ question: "Can you organise the entire MICE programme?" }).first();
  await db()("faqs").where({ id: victim.id }).delete();
  await seed(db());
  assert.equal(await count("faqs"), 29);
  const { id, ...rest } = victim;
  await db()("faqs").insert({ id, ...rest });
});

test("the FAQ page renders every group, flag and question from the database, with FAQPage JSON-LD", async () => {
  const res = await request(app).get("/faq");
  assert.equal(res.status, 200);
  assert.match(res.text, /<a href="#faq-planning" class="faq-jump">Planning and logistics <span>5<\/span><\/a>/);
  assert.match(res.text, /<section class="faq-group" id="faq-destinations" aria-labelledby="faq-destinations-title" data-faq-group>/);
  assert.match(res.text, /<span class="faq-group-count">20 questions<\/span>/);
  assert.match(res.text, /<details class="faq-item" data-country="zw">\s*<summary class="faq-question"><img class="faq-flag" src="\/assets\/images\/flags\/zw.svg" alt="" width="24" height="18"><span class="faq-q-text">Can you organise a corporate programme around Victoria Falls\?<\/span>/);
  assert.equal((res.text.match(/<details class="faq-item"/g) || []).length, 30);
  const ld = JSON.parse(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"FAQPage"[\s\S]*?)<\/script>/.exec(res.text)[1]);
  assert.equal(ld.mainEntity.length, 30);
  assert.equal(ld.mainEntity[0].acceptedAnswer.text.startsWith("MICE stands for Meetings"), true);
});

test("the homepage FAQ preview shows the marked questions in order, never more than 5", async () => {
  let home = homeFaqList((await request(app).get("/")).text);
  assert.deepEqual([...home.matchAll(/<summary class="faq-question">([^<]+)</g)].map((m) => m[1]), [
    "What does MICE stand for?",
    "Which African destinations do you offer for MICE travel?",
    "Can you create a tailor-made MICE programme?",
    "Can business events be combined with leisure or safari experiences?",
    "How do we request a MICE proposal?",
  ]);

  const before = await db()("faqs").where({ show_on_home: true }).pluck("id");
  await db()("faqs").update({ show_on_home: true });
  home = homeFaqList((await request(app).get("/")).text);
  assert.equal((home.match(/<details class="faq-item">/g) || []).length, 5, "capped at 5");
  const list = await admin.get("/admin/faqs");
  assert.match(list.text, /30 published questions are marked for the homepage\. Only the first 5 are shown there/);
  await db()("faqs").update({ show_on_home: false });
  await db()("faqs").whereIn("id", before).update({ show_on_home: true });
});

test("reordering FAQ questions changes the page order and refuses rows from elsewhere", async () => {
  const group = await db()("faq_groups").where({ slug: "getting-started" }).first();
  const ids = await db()("faqs").where({ group_id: group.id }).orderBy("sort_order").pluck("id");
  const reversed = [...ids].reverse();

  const res = await as(admin)(admin.patch("/admin/faqs/reorder")).send({ ids: reversed });
  assert.equal(res.status, 200);
  assert.deepEqual(await db()("faqs").where({ group_id: group.id }).orderBy("sort_order").pluck("id"), reversed);
  const page = (await request(app).get("/faq")).text;
  assert.ok(page.indexOf("Can business events be combined") < page.indexOf("What does MICE stand for?"), "the page follows the new order");

  // Rows from another group, a partial list, or a duplicate are all refused.
  const other = await db()("faqs").whereNot({ group_id: group.id }).first();
  for (const bad of [[...reversed.slice(1), other.id], reversed.slice(1), [...reversed, reversed[0]], [999999, ...reversed.slice(1)]]) {
    const r = await as(admin)(admin.patch("/admin/faqs/reorder")).send({ ids: bad });
    assert.equal(r.status, 422, JSON.stringify(bad));
  }
  assert.deepEqual(await db()("faqs").where({ group_id: group.id }).orderBy("sort_order").pluck("id"), reversed, "nothing changed");
  const audit = await db()("audit_log").where({ action: "reorder", entity: "faq" }).first();
  assert.ok(audit, "the reorder is in the audit log");

  await as(admin)(admin.patch("/admin/faqs/reorder")).send(ids);
  assert.deepEqual(await db()("faqs").where({ group_id: group.id }).orderBy("sort_order").pluck("id"), ids, "a bare array works too");
});

test("FAQ answers are cleaned to short rich text; groups with questions cannot be deleted", async () => {
  const group = await db()("faq_groups").where({ slug: "planning" }).first();
  const res = await as(admin)(admin.post("/admin/faqs")).send({
    group_id: group.id,
    question: "Do you handle visas?",
    answer: '<h2>Yes</h2><p onclick="x()">We advise on <b>visas</b>.<script>alert(1)</script></p><ul><li>Letters</li></ul><img src="https://x.test/a.png">',
    country_iso2: "",
    status: "published",
  });
  assert.equal(res.status, 201);
  const row = await db()("faqs").where({ question: "Do you handle visas?" }).first();
  assert.equal(row.answer, "<p>Yes</p><p>We advise on <strong>visas</strong>.</p><ul><li>Letters</li></ul>");
  assert.equal(row.sort_order, 5, "added at the end of its group");
  const page = (await request(app).get("/faq")).text;
  assert.match(page, /<div class="faq-answer"><p>Yes<\/p><p>We advise on <strong>visas<\/strong>\.<\/p><ul><li>Letters<\/li><\/ul><\/div>/);

  const empty = await as(admin)(admin.post("/admin/faqs")).send({ group_id: group.id, question: "Empty?", answer: "<p> </p>", status: "draft" });
  assert.equal(empty.status, 422);
  assert.ok(empty.body.fieldErrors.answer);

  const del = await as(admin)(admin.delete(`/admin/faqs/groups/${group.id}`));
  assert.equal(del.status, 422);
  assert.match(del.body.error, /cannot be deleted/);
  await db()("faqs").where({ id: row.id }).delete();
});

test("editors can manage FAQs", async () => {
  assert.equal((await editor.get("/admin/faqs")).status, 200);
  const group = await as(editor)(editor.post("/admin/faqs/groups")).send({ name: "Payments and contracts" });
  assert.equal(group.status, 201);
  const g = await db()("faq_groups").where({ name: "Payments and contracts" }).first();
  assert.equal(g.slug, "payments-and-contracts");
  const q = await as(editor)(editor.post("/admin/faqs")).send({ group_id: g.id, question: "Which currencies do you invoice in?", answer: "<p>Ask us.</p>", status: "draft" });
  assert.equal(q.status, 201);
  const id = (await db()("faqs").where({ group_id: g.id }).first()).id;
  assert.equal((await as(editor)(editor.delete(`/admin/faqs/${id}`))).status, 200);
  assert.equal((await as(editor)(editor.delete(`/admin/faqs/groups/${g.id}`))).status, 200);
});

/* Partners ---------------------------------------------------------------------- */

const partnerNames = () => db()("partners").orderBy("sort_order").pluck("name");
const statsFigure = (html, label) => new RegExp(`<dt>${label}</dt><dd><span data-count-to="(\\d+)">(\\d+)</span></dd>`).exec(html);
const transparentPng = (width, height) => require("sharp")({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

test("partner seed matches the reviewed page, keeps its order and is safe to re-run", async () => {
  const { partners } = readJson("partners.json");
  assert.deepEqual(await partnerNames(), partners.map((p) => p.name));
  await seed(db());
  assert.equal(await count("partners"), 28);
  assert.deepEqual(await partnerNames(), partners.map((p) => p.name));
  const mercure = await db()("partners as p").join("media as m", "m.id", "p.logo_media_id").where("p.name", "Mercure Windhoek").first("p.dark_background", "m.file_url", "m.width", "m.height");
  assert.deepEqual({ ...mercure }, { dark_background: true, file_url: "/assets/images/sponsors/mercure-windhoek.png", width: 305, height: 137 });
});

test("the Partners page and the logo strips render from the database", async () => {
  const page = (await request(app).get("/partners")).text;
  assert.equal((page.match(/<li class="partner-card"/g) || []).length, 28);
  assert.match(page, /<div class="partner-card-logo partner-card-logo--dark"><img src="\/assets\/images\/sponsors\/mercure-windhoek.png" alt="Mercure Windhoek" width="305" height="137" loading="lazy" decoding="async"><\/div>/);
  assert.match(page, /<li class="partner-card" data-country="regional">\s*<div class="partner-card-logo"><img src="\/assets\/images\/sponsors\/hilton-garden-inn.png"/);
  assert.match(page, /<span class="reach-tile-name">Namibia<\/span>\s*<span class="reach-tile-cities">9 partner venues<\/span>/);
  assert.match(page, /<span class="reach-tile-name">Tanzania<\/span>\s*<span class="reach-tile-cities">1 partner venue<\/span>/);
  assert.match(page, /Regional brands <span>3<\/span>/);
  assert.match(page, /<dd data-count-to="28">28<\/dd>/);

  for (const url of ["/", "/about", "/faq"]) {
    const html = (await request(app).get(url)).text;
    const start = html.indexOf('<div class="trusted-track">');
    const track = html.slice(start, html.indexOf("</div>", start));
    assert.equal((track.match(/<img src=/g) || []).length, 12, `${url}: 12 logos`);
    assert.equal((track.match(/<img aria-hidden="true"/g) || []).length, 12, `${url}: and the hidden repeat`);
  }
});

test("partner and destination figures follow the database everywhere they appear", async () => {
  let home = (await request(app).get("/")).text;
  assert.deepEqual(statsFigure(home, "Partner venues and hotels").slice(1), ["28", "28"]);
  assert.deepEqual(statsFigure(home, "African destinations").slice(1), ["9", "9"]);
  assert.match(home, /One Partner\. Nine Destinations\./);
  assert.match(home, /<p class="footer-flags-label">Nine destinations<\/p>/);

  const two = await db()("partners").orderBy("sort_order", "desc").limit(2).pluck("id");
  await db()("partners").whereIn("id", two).update({ status: "draft" });
  await db()("countries").where({ iso2: "ug" }).update({ is_destination: false });
  try {
    home = (await request(app).get("/")).text;
    assert.deepEqual(statsFigure(home, "Partner venues and hotels").slice(1), ["26", "26"], "homepage stats card");
    assert.deepEqual(statsFigure(home, "African destinations").slice(1), ["8", "8"]);
    assert.match(home, /One Partner\. Eight Destinations\./);
    assert.match(home, /<p class="footer-flags-label">Eight destinations<\/p>/);
    const about = (await request(app).get("/about")).text;
    assert.deepEqual(statsFigure(about, "Partner venues and hotels").slice(1), ["26", "26"], "About stats card");
    const partners = (await request(app).get("/partners")).text;
    assert.match(partners, /<dd data-count-to="26">26<\/dd>/, "Partners map section");
    assert.match(partners, /Showing all 26 partners/);
    assert.equal((partners.match(/<li class="partner-card"/g) || []).length, 26, "drafts are not shown");
    assert.match((await request(app).get("/services")).text, /across eight African destinations/);
  } finally {
    await db()("partners").whereIn("id", two).update({ status: "published" });
    await db()("countries").where({ iso2: "ug" }).update({ is_destination: true });
  }
});

test("a PNG logo keeps its transparency and the 600px cap; SVG logos are checked", async () => {
  const sharp = require("sharp");
  const png = await transparentPng(900, 300)
    .composite([{ input: { create: { width: 300, height: 100, channels: 4, background: "#1D3161" } }, left: 300, top: 100 }])
    .png()
    .toBuffer();
  const res = await as(admin)(admin.post("/admin/media")).field("mode", "logo").attach("file", png, "brand-logo.png");
  assert.equal(res.status, 201);
  const m = await db()("media").where({ id: res.body.media.id }).first();
  assert.equal(m.formats, "png");
  assert.match(m.file_url, /^\/uploads\/\d{4}\/\d{2}\/[a-f0-9]{12}-brand-logo\.png$/);
  assert.deepEqual([m.width, m.height], [600, 200]);
  const file = path.join(config.uploads.dir, m.file_url.replace("/uploads/", ""));
  const meta = await sharp(file).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.hasAlpha, true);
  const corner = await sharp(file).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  assert.equal(corner[3], 0, "the transparent background stays transparent");
  assert.equal(res.body.media.thumb, m.file_url, "the admin preview shows the file itself");

  const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(document.cookie)</script><rect width="10" height="10"/></svg>';
  const refused = await as(admin)(admin.post("/admin/media")).field("mode", "logo").attach("file", Buffer.from(evil), "evil.svg");
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /contains a script/);
  const handler = await as(admin)(admin.post("/admin/media")).field("mode", "logo").attach("file", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>'), "h.svg");
  assert.equal(handler.status, 400);

  const clean = '<?xml version="1.0"?><!-- exported by a tool --><svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"><rect width="300" height="100" fill="#EF8621"/></svg>';
  const ok = await as(admin)(admin.post("/admin/media")).field("mode", "logo").attach("file", Buffer.from(clean), "clean.svg");
  assert.equal(ok.status, 201);
  const svg = await db()("media").where({ id: ok.body.media.id }).first();
  assert.deepEqual([svg.formats, svg.width, svg.height], ["svg", 300, 100]);
  const stored = fs.readFileSync(path.join(config.uploads.dir, svg.file_url.replace("/uploads/", "")), "utf8");
  assert.doesNotMatch(stored, /exported by a tool/, "comments are stripped");
  const served = await request(app).get(svg.file_url);
  assert.equal(served.status, 200);
  assert.match(served.headers["content-type"], /image\/svg\+xml/);

  // Photo uploads are unchanged: SVG is not accepted as a photo.
  const photoSvg = await as(admin)(admin.post("/admin/media")).attach("file", Buffer.from(clean), "clean.svg");
  assert.equal(photoSvg.status, 400);
});

test("partners reorder within their own list only", async () => {
  const ids = await db()("partners").orderBy("sort_order").pluck("id");
  const moved = [ids[1], ids[0], ...ids.slice(2)];
  assert.equal((await as(admin)(admin.patch("/admin/partners/reorder")).send({ ids: moved })).status, 200);
  assert.deepEqual(await db()("partners").orderBy("sort_order").pluck("id"), moved);

  // FAQ ids sent to the partners list are refused: they are not exactly this
  // list. (Ids are plain numbers, so a list that happens to be exactly the
  // partner ids is simply a valid order of the partners.)
  const faqIds = await db()("faqs").orderBy("id", "desc").limit(ids.length).pluck("id");
  assert.ok(faqIds.some((id) => !ids.includes(id)), "the FAQ ids are not the partner ids");
  assert.equal((await as(admin)(admin.patch("/admin/partners/reorder")).send({ ids: faqIds })).status, 422);
  // And partner ids sent to the FAQs are refused too (here: rows spread over
  // more than one FAQ group).
  assert.equal((await as(admin)(admin.patch("/admin/faqs/reorder")).send({ ids: ids.slice(0, 8) })).status, 422);
  assert.deepEqual(await db()("partners").orderBy("sort_order").pluck("id"), moved, "nothing changed");
  await as(admin)(admin.patch("/admin/partners/reorder")).send({ ids });
});

test("editors can manage partners; a published partner needs a logo", async () => {
  assert.equal((await editor.get("/admin/partners")).status, 200);
  const noLogo = await as(editor)(editor.post("/admin/partners")).send({ name: "Safari Lodge Group", status: "published" });
  assert.equal(noLogo.status, 422);
  assert.ok(noLogo.body.fieldErrors.logo_media_id);

  const png = await transparentPng(200, 80).png().toBuffer();
  const up = await as(editor)(editor.post("/admin/media")).field("mode", "logo").attach("file", png, "safari.png");
  const created = await as(editor)(editor.post("/admin/partners")).send({ name: "Safari Lodge Group", logo_media_id: up.body.media.id, country_iso2: "bw", website_url: "https://safari.example.test", show_in_marquee: true, status: "published" });
  assert.equal(created.status, 201);
  const row = await db()("partners").where({ name: "Safari Lodge Group" }).first();
  assert.equal(row.sort_order, 28, "added at the end");
  const page = (await request(app).get("/partners")).text;
  assert.match(page, /<p class="partner-card-name"><a href="https:\/\/safari.example.test" target="_blank" rel="noopener">Safari Lodge Group<\/a><\/p>/);
  assert.match(page, /Showing all 29 partners/);

  const del = await as(editor)(editor.delete(`/admin/partners/${row.id}`));
  assert.equal(del.status, 200);
  assert.equal(await db()("media").where({ id: up.body.media.id }).first(), undefined, "the unused logo is removed");
  assert.ok(await db()("audit_log").where({ entity: "partner", action: "delete", entity_id: row.id }).first());
});
