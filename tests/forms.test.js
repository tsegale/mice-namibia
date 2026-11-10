"use strict";

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { request, createApp, resetDatabase, loggedInAgent, teardown, db } = require("./helpers");
const mailer = require("../src/services/mailer");

let app;
let agent;
let sent = [];
let failMail = false;
const fakeTransport = {
  sendMail: async (m) => {
    if (failMail) throw new Error("Connection refused");
    sent.push(m);
    return { messageId: "test" };
  },
};

const json = (req) => req.set("Accept", "application/json").set("X-Requested-With", "fetch");
const adminJson = (req) => json(req).set("X-CSRF-Token", agent.csrf);

const GENERAL = { enquiry_type: "general", first_name: "Ana", last_name: "Tester", email: "Ana@Example.com", phone: "+264 81 000 0000", message: "Hello, we need a boardroom." };
const PROPOSAL = {
  ...GENERAL,
  enquiry_type: "proposal",
  organisation: "Example Org",
  event_type: "Conference",
  destination: "Namibia",
  dates: "March 2027",
  delegates: "120",
  services: ["Conference Management", "Not a real service"],
  message: "=HYPERLINK(\"http://evil\")",
};

before(async () => {
  await resetDatabase();
  app = createApp();
  agent = await loggedInAgent(app);
  mailer.useTransport(fakeTransport);
});
after(async () => {
  mailer.useTransport(null);
  await teardown(app);
});
beforeEach(() => {
  sent = [];
  failMail = false;
});

/* Contact form -------------------------------------------------------------------- */

test("a general enquiry is saved, then emailed to the team with reply-to set", async () => {
  const res = await json(request(app).post("/contact")).type("form").send(GENERAL);
  assert.equal(res.status, 201, res.text);
  const row = await db()("submissions").orderBy("id", "desc").first();
  assert.equal(row.type, "general");
  assert.equal(row.name, "Ana Tester");
  assert.equal(row.email, "ana@example.com");
  assert.equal(row.status, "new");
  assert.equal(row.email_status, "sent");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].replyTo, { name: "Ana Tester", address: "ana@example.com" });
  assert.match(sent[0].subject, /General enquiry from Ana Tester/);
  assert.match(sent[0].text, /boardroom/);
});

test("a proposal keeps its event details and drops unknown services", async () => {
  const res = await json(request(app).post("/contact")).type("form").send(PROPOSAL);
  assert.equal(res.status, 201, res.text);
  const row = await db()("submissions").orderBy("id", "desc").first();
  assert.equal(row.type, "proposal");
  assert.equal(row.company, "Example Org");
  assert.equal(row.subject, "Proposal request: Conference");
  const d = JSON.parse(row.details);
  assert.equal(d.delegates, 120);
  assert.deepEqual(d.services, ["Conference Management"]);
  assert.match(sent[0].html, /&quot;http:\/\/evil&quot;/, "user text is escaped in the HTML email");
});

test("validation returns a message per field", async () => {
  const res = await json(request(app).post("/contact")).type("form").send({ enquiry_type: "proposal", first_name: "", email: "not-an-email", phone: "12" });
  assert.equal(res.status, 422);
  assert.ok(res.body.fieldErrors.first_name);
  assert.ok(res.body.fieldErrors.last_name);
  assert.match(res.body.fieldErrors.email, /valid email/);
  assert.match(res.body.fieldErrors.phone, /too short/);
  assert.match(res.body.fieldErrors.event_type, /type of event/);
});

test("without JavaScript: errors come back on the page with the values kept, success redirects", async () => {
  const bad = await request(app).post("/contact").type("form").send({ ...GENERAL, email: "nope" });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /value="Ana"/);
  assert.match(bad.text, /class="field-error" id="err-email"/);
  assert.match(bad.text, /Hello, we need a boardroom\.<\/textarea>/);

  const ok = await request(app).post("/contact").type("form").send(GENERAL);
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.location, "/contact?sent=1#contact-form");
  const page = await request(app).get("/contact?sent=1");
  assert.match(page.text, /data-contact-form action="\/contact" method="post" novalidate hidden/);
  assert.match(page.text, /data-form-confirmation tabindex/);
});

test("the spam trap pretends to succeed and stores nothing", async () => {
  const before = (await db()("submissions").count({ n: "*" }).first()).n;
  const res = await json(request(app).post("/contact")).type("form").send({ ...GENERAL, website: "http://spam.example" });
  assert.equal(res.status, 201);
  assert.equal((await db()("submissions").count({ n: "*" }).first()).n, before);
  assert.equal(sent.length, 0);
});

test("posts from another website are refused", async () => {
  const res = await json(request(app).post("/contact")).set("Origin", "https://evil.example").type("form").send(GENERAL);
  assert.equal(res.status, 403);
  const fetchMeta = await request(app).post("/newsletter").set("Sec-Fetch-Site", "cross-site").type("form").send({ email: "x@example.com" });
  assert.equal(fetchMeta.status, 403);
  const sameSite = await json(request(app).post("/newsletter")).set("Sec-Fetch-Site", "same-origin").set("Origin", "null").type("form").send({ email: "same@example.com" });
  assert.equal(sameSite.status, 201, "a same-origin post with a hidden origin is fine");
});

test("a mail failure never loses the enquiry, and it can be re-sent from the admin", async () => {
  failMail = true;
  const res = await json(request(app).post("/contact")).type("form").send(GENERAL);
  assert.equal(res.status, 201, "the visitor still sees success");
  const row = await db()("submissions").orderBy("id", "desc").first();
  assert.equal(row.email_status, "failed");
  assert.match(row.email_error, /Connection refused/);

  const list = await agent.get("/admin/submissions");
  assert.match(list.text, /could not be sent/);

  failMail = false;
  const resend = await adminJson(agent.post(`/admin/submissions/${row.id}/resend`)).send({});
  assert.equal(resend.status, 200, resend.text);
  assert.equal((await db()("submissions").where({ id: row.id }).first()).email_status, "sent");
});

test("without email set up the enquiry is saved and marked as not emailed", async () => {
  mailer.useTransport(null);
  try {
    const res = await json(request(app).post("/contact")).type("form").send(GENERAL);
    assert.equal(res.status, 201);
    const row = await db()("submissions").orderBy("id", "desc").first();
    assert.equal(row.email_status, "skipped");
  } finally {
    mailer.useTransport(fakeTransport);
  }
});

/* Admin inbox ---------------------------------------------------------------------- */

test("opening an enquiry marks it read; status changes and deletes are audited", async () => {
  const row = await db()("submissions").where({ status: "new" }).first();
  const panel = await agent.get(`/admin/submissions/${row.id}`);
  assert.equal(panel.status, 200);
  assert.match(panel.text, /data-marked-read/);
  assert.match(panel.text, /mailto:ana%40example\.com\?subject=/);
  assert.equal((await db()("submissions").where({ id: row.id }).first()).status, "read");

  const replied = await adminJson(agent.post(`/admin/submissions/${row.id}/status`)).send({ status: "replied" });
  assert.equal(replied.status, 200);
  const badStatus = await adminJson(agent.post(`/admin/submissions/${row.id}/status`)).send({ status: "spam" });
  assert.equal(badStatus.status, 422);

  const del = await adminJson(agent.delete(`/admin/submissions/${row.id}`));
  assert.equal(del.status, 200);
  assert.equal(await db()("submissions").where({ id: row.id }).first(), undefined);
  const actions = await db()("audit_log").where({ entity: "submission" }).pluck("action");
  assert.ok(actions.includes("update") && actions.includes("delete"));
});

test("the CSV export opens safely in Excel", async () => {
  const res = await agent.get("/admin/submissions/export.csv?show=all");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/csv/);
  assert.match(res.headers["content-disposition"], /attachment; filename="mice-enquiries-all-/);
  assert.ok(res.text.startsWith("﻿Received (Windhoek time),"));
  assert.match(res.text, /"'=HYPERLINK\(""http:\/\/evil""\)"/, "formulas are neutralised");
  assert.match(res.text, /Conference Management/);
});

test("the inbox needs a login", async () => {
  const res = await request(app).get("/admin/submissions");
  assert.equal(res.status, 302);
  const csv = await request(app).get("/admin/submissions/export.csv");
  assert.equal(csv.status, 302);
});

/* Newsletter ------------------------------------------------------------------------ */

test("newsletter sign-ups are stored once and answer the same either way", async () => {
  const a = await json(request(app).post("/newsletter")).set("Referer", "http://127.0.0.1/blog").type("form").send({ email: "Reader@Example.com" });
  const b = await json(request(app).post("/newsletter")).type("form").send({ email: "reader@example.com" });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.deepEqual(a.body, b.body);
  const rows = await db()("subscribers").where({ email: "reader@example.com" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "/blog");
  assert.match(rows[0].token, /^[a-f0-9]{48}$/);
  const bad = await json(request(app).post("/newsletter")).type("form").send({ email: "nope" });
  assert.equal(bad.status, 422);
});

test("without JavaScript the sign-up returns to the same page with the success message", async () => {
  const res = await request(app).post("/newsletter").set("Host", "mice.test").set("Referer", "http://mice.test/venues").type("form").send({ email: "nojs@example.com" });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, "/venues?subscribed=1#newsletter");
  const offsite = await request(app).post("/newsletter").set("Referer", "https://elsewhere.example/page").type("form").send({ email: "nojs2@example.com" });
  assert.equal(offsite.headers.location, "/?subscribed=1#newsletter", "never redirects off the site");
  const page = await request(app).get("/venues?subscribed=1");
  assert.match(page.text, /data-newsletter-form action="\/newsletter" method="post" hidden/);
  assert.match(page.text, /data-newsletter-success role="status">/);
});

test("unsubscribe links ask first, then unsubscribe; admins can export and remove", async () => {
  const sub = await db()("subscribers").where({ email: "reader@example.com" }).first();
  const confirm = await request(app).get(`/newsletter/unsubscribe/${sub.token}`);
  assert.equal(confirm.status, 200);
  assert.match(confirm.text, /Stop receiving event alerts\?/);
  assert.doesNotMatch(confirm.text, /id="newsletter"/, "no sign-up form on the unsubscribe page");
  assert.equal((await db()("subscribers").where({ id: sub.id }).first()).status, "subscribed", "GET changes nothing");

  const done = await request(app).post(`/newsletter/unsubscribe/${sub.token}`).type("form").send({});
  assert.equal(done.status, 200);
  assert.match(done.text, /You have been unsubscribed/);
  assert.equal((await db()("subscribers").where({ id: sub.id }).first()).status, "unsubscribed");
  assert.equal((await request(app).get("/newsletter/unsubscribe/abc")).status, 404);

  const csv = await agent.get("/admin/subscribers/export.csv");
  assert.match(csv.text, /nojs@example\.com,subscribed/);
  assert.doesNotMatch(csv.text, /reader@example\.com/, "the default export leaves out unsubscribed people");

  const other = await db()("subscribers").where({ email: "nojs@example.com" }).first();
  const unsub = await adminJson(agent.post(`/admin/subscribers/${other.id}/unsubscribe`)).send({});
  assert.equal(unsub.status, 200);
  const del = await adminJson(agent.delete(`/admin/subscribers/${other.id}`));
  assert.equal(del.status, 200);
  assert.equal(await db()("subscribers").where({ id: other.id }).first(), undefined);
  const list = await agent.get("/admin/subscribers?show=all");
  assert.match(list.text, /reader@example\.com/);
});
