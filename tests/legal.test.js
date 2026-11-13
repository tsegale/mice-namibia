"use strict";

// Legal pages: versioned markdown. Version 1 is the client's file as
// delivered; the public page renders it exactly as the reviewed static page
// did; new versions are previewed, compared and published, never changed.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { request, createApp, resetDatabase, loggedInAgent, csrfFrom, teardown, db } = require("./helpers");
const { run: seed } = require("../src/db/seeds");
const { hashPassword } = require("../src/services/auth");
const legalService = require("../src/services/legal");
const { render } = require("../src/lib/legal-markdown");

const EDITOR = { email: "editor@example.test", password: "editor-horse-42-battery" };
const FILE = (slug) => fs.readFileSync(path.join(__dirname, "..", "content", "legal", `${slug}.md`), "utf8");

let app;
let admin;
let editor;
const as = (agent) => (req) => req.set("X-CSRF-Token", agent.csrf).set("X-Requested-With", "fetch").set("Accept", "application/json");
const body = (html) => html.slice(html.indexOf('<article class="legal-body">'), html.indexOf("</article>"));
const NEW_TEXT = (md) => md.replace("**Effective Date: 01 January 2027**", "**Effective Date: 01 March 2028**").replace("## 15. Governing Law", "## 15. Governing Law and Disputes");

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
});
after(() => teardown(app));

test("version 1 is the client's markdown exactly, and the page renders it", async () => {
  for (const slug of ["privacy-policy", "terms-and-conditions"]) {
    const doc = await db()("legal_documents").where({ slug }).first();
    const v1 = await db()("legal_document_versions").where({ document_id: doc.id }).first();
    assert.equal(v1.markdown, FILE(slug), `${slug}: stored exactly as the file`);
    assert.equal(v1.version_number, 1);
    assert.equal(doc.current_version_id, v1.id);

    const html = (await request(app).get(`/${slug}`)).text;
    const r = render(FILE(slug), { links: slug === "terms-and-conditions" ? { "Privacy Policy": "/privacy-policy" } : {} });
    assert.ok(body(html).includes(r.html), `${slug}: the body is the rendered markdown`);
    assert.match(html, /<p class="effective-badge"><svg[^]*?<\/svg>Effective Date: 01 January 2027<\/p>/);
    assert.equal([...html.matchAll(/<li><a href="#section-\d+">/g)].length, r.sections.length, "a contents entry per heading");
    assert.match(html, /<nav class="legal-toc" aria-labelledby="toc-title" data-toc>/, "scroll-spy hook kept");
    assert.doesNotMatch(html, /Previous versions/, "no link while there is one version");
  }
  assert.match((await request(app).get("/terms-and-conditions")).text, /<strong><a href="\/privacy-policy">Privacy Policy<\/a><\/strong>/);
  assert.match((await request(app).get("/privacy-policy")).text, /12\. Children's Privacy<\/a><\/li>/, "apostrophes as in the static page");

  await seed(db());
  assert.equal(await db()("legal_document_versions").count({ n: "*" }).then(([r]) => Number(r.n)), 2, "the seed adds version 1 once");
});

test("the renderer escapes anything that is not part of the legal markdown", () => {
  const r = render("# T\n\n## 1. A <b>\n\nText <script>alert(1)</script> & **bold <i>**\n\n- [link](javascript:alert(1))\n");
  assert.doesNotMatch(r.html, /<script|<b>|<i>|href="javascript/);
  assert.match(r.html, /&lt;script&gt;/);
});

test("Legal pages is for admins only", async () => {
  assert.equal((await editor.get("/admin/legal")).status, 403);
  assert.equal((await as(editor)(editor.post("/admin/legal/privacy-policy/versions")).send({ markdown: "x", effective_date: "2028-01-01", note: "x" })).status, 403);
  assert.doesNotMatch((await editor.get("/admin")).text, /href="\/admin\/legal"/);
  assert.equal((await admin.get("/admin/legal")).status, 200);
});

test("a new version is previewed with a word-level diff, then published with a date and a note", async () => {
  const md = NEW_TEXT(FILE("privacy-policy"));
  const preview = await as(admin)(admin.post("/admin/legal/privacy-policy/preview")).send({ markdown: md });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.effectiveInText, "2028-03-01");
  assert.match(preview.body.diff.html, /<del>January 2027\*\*<\/del>|<del>[^<]*January[^<]*<\/del>/);
  assert.match(preview.body.diff.html, /<ins>[^<]*Disputes[^<]*<\/ins>/);
  assert.match(preview.body.html, /<h2 id="section-15">15\. Governing Law and Disputes<\/h2>/);

  const noNote = await as(admin)(admin.post("/admin/legal/privacy-policy/versions")).send({ markdown: md, effective_date: "2028-03-01", note: "" });
  assert.equal(noNote.status, 422);
  assert.ok(noNote.body.fieldErrors.note);
  const wrongDate = await as(admin)(admin.post("/admin/legal/privacy-policy/versions")).send({ markdown: md, effective_date: "2028-04-01", note: "Client update" });
  assert.equal(wrongDate.status, 422);
  assert.match(wrongDate.body.fieldErrors.effective_date, /01 March 2028/);
  const noHeadings = await as(admin)(admin.post("/admin/legal/privacy-policy/preview")).send({ markdown: "Just a paragraph." });
  assert.equal(noHeadings.status, 422);

  const res = await as(admin)(admin.post("/admin/legal/privacy-policy/versions")).send({ markdown: md, effective_date: "2028-03-01", note: "Client update: dispute wording." });
  assert.equal(res.status, 201);

  const html = (await request(app).get("/privacy-policy")).text;
  assert.match(html, /Effective Date: 01 March 2028<\/p>/, "the published version's effective date is shown");
  assert.match(html, /Governing Law and Disputes/);
  assert.match(html, /<p class="legal-versions-link"><a href="\/privacy-policy\/versions">Previous versions<\/a><\/p>/, "the link appears with a second version");
  assert.doesNotMatch((await request(app).get("/terms-and-conditions")).text, /Previous versions/, "only on the document that has one");

  const list = (await request(app).get("/privacy-policy/versions")).text;
  assert.match(list, /<meta name="robots" content="noindex">/);
  assert.ok(list.indexOf("Effective 01 March 2028") < list.indexOf("Effective 01 January 2027"), "newest first, by effective date");
  const old = await request(app).get("/privacy-policy/versions/1");
  assert.equal(old.status, 200);
  assert.match(old.text, /Effective Date: 01 January 2027/);
  assert.match(old.text, /in effect from 01 January 2027 until 01 March 2028/);
  assert.doesNotMatch(old.text, /Governing Law and Disputes/);
  assert.equal((await request(app).get("/privacy-policy/versions/2")).headers.location, "/privacy-policy");
  assert.equal((await request(app).get("/privacy-policy/versions/9")).status, 404);

  const log = await db()("audit_log").where({ entity: "legal_document" }).orderBy("id", "desc").first();
  assert.equal(log.summary, "published version 2 of the Privacy Policy, effective 01 March 2028: Client update: dispute wording.");
});

test("published versions can never be changed or deleted", async () => {
  const doc = await db()("legal_documents").where({ slug: "privacy-policy" }).first();
  const v1Before = await db()("legal_document_versions").where({ document_id: doc.id, version_number: 1 }).first();

  for (const method of ["put", "patch", "delete"]) {
    const res = await as(admin)(admin[method]("/admin/legal/privacy-policy/versions/1")).send({ markdown: "changed", note: "changed" });
    assert.equal(res.status, 404, `${method.toUpperCase()} has no route`);
  }
  assert.equal((await as(admin)(admin.delete("/admin/legal/privacy-policy")).send({})).status, 404);
  // The service offers no way to do it either.
  assert.deepEqual(Object.keys(legalService).filter((k) => /update|delete|remove|edit|change/i.test(k)), []);

  // Publishing another version leaves the earlier ones exactly as they were.
  await as(admin)(admin.post("/admin/legal/privacy-policy/versions")).send({ markdown: FILE("privacy-policy").replace("**Effective Date: 01 January 2027**\n", ""), effective_date: "2028-06-01", note: "Reverted wording." }).expect(201);
  assert.deepEqual(await db()("legal_document_versions").where({ id: v1Before.id }).first(), v1Before);
  assert.equal(await db()("legal_document_versions").where({ document_id: doc.id }).count({ n: "*" }).then(([r]) => Number(r.n)), 3);
  assert.match((await request(app).get("/privacy-policy")).text, /Effective Date: 01 June 2028<\/p>/, "a version without a date line uses the chosen date");

  // The database refuses to delete a document that has versions.
  await assert.rejects(db()("legal_documents").where({ id: doc.id }).delete());
});
