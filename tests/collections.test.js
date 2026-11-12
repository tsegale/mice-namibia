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
