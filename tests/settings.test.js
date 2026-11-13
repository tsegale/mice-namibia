"use strict";

// Admin > Settings: typed groups on top of the settings table, read through
// a cache that a save clears, printed everywhere the site showed the old
// hard-coded values. Admin role only.

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { request, createApp, resetDatabase, loggedInAgent, csrfFrom, teardown, db } = require("./helpers");
const { run: seed } = require("../src/db/seeds");
const { hashPassword } = require("../src/services/auth");
const mailer = require("../src/services/mailer");
const settings = require("../src/services/settings");
const media = require("../src/repositories/media");

const EDITOR = { email: "editor@example.test", password: "editor-horse-42-battery" };
const CONTACT = { phone: "+264 61 123 4567", email: "Events@Example.test", address: "1 Independence Avenue, Windhoek", map_query: "Independence Avenue, Windhoek" };

let app;
let admin;
let editor;
let sent = [];
const as = (agent) => (req) => req.set("X-CSRF-Token", agent.csrf).set("X-Requested-With", "fetch").set("Accept", "application/json");
const put = (agent, group, body) => as(agent)(agent.put(`/admin/settings/${group}`)).send(body);
const contactJson = (body) => request(app).post("/contact").set("Accept", "application/json").set("X-Requested-With", "fetch").set("Sec-Fetch-Site", "same-origin").send(body);
const GENERAL = { enquiry_type: "general", first_name: "Ana", last_name: "Tester", email: "ana@example.test", phone: "+264 81 000 0000", message: "Hello." };
const footer = (html) => html.slice(html.indexOf('<footer class="site-footer"'));

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
  mailer.useTransport({ sendMail: async (m) => sent.push(m) });
});
beforeEach(async () => {
  sent = [];
  await db()("settings").where("key", "like", "settings.%").delete();
  settings.clearCache();
});
after(async () => {
  mailer.useTransport(null);
  await teardown(app);
});

test("with nothing saved the site prints today's values", async () => {
  const home = (await request(app).get("/")).text;
  assert.match(home, /<title>MICE Namibia \| Meetings, Incentives, Conferences &amp; Exhibitions<\/title>/);
  assert.match(home, /<meta name="description" content="MICE Namibia delivers end-to-end meetings, incentives, conferences and exhibitions management across nine African destinations.">/);
  assert.match(home, /<a href="tel:\+264812455852">\+264 81 245 5852<\/a>/);
  assert.match(footer(home), /End-to-end meetings, incentives, conferences and exhibitions management across nine African destinations\./);
  assert.match(footer(home), /Copyright <span data-current-year>2026<\/span> Zusammen Tours and Travel Agency \(MICE Department\)\. All rights reserved\./);
  assert.equal((footer(home).match(/class="social-link /g) || []).length, 6);
  assert.match((await request(app).get("/faq")).text, /<title>FAQ \| MICE Namibia<\/title>/);
});

test("contact, social and footer settings reach the header menu, footer, contact page and Let's Connect band", async () => {
  assert.equal((await put(admin, "contact", CONTACT)).status, 200);
  assert.equal((await put(admin, "footer", { company_line: "Events across {destinations} countries with {partners} partners.", copyright_holder: "Example Holder Ltd" })).status, 200);
  const social = { ...settings.GROUPS.social.defaults, youtube: "", x: "https://x.com/example" };
  assert.equal((await put(admin, "social", social)).status, 200);

  const home = (await request(app).get("/")).text;
  const menu = home.slice(home.indexOf('class="nav-panel-extra"'), home.indexOf("</div>", home.indexOf('class="nav-panel-extra"')));
  assert.match(menu, /<a href="tel:\+264611234567">\+264 61 123 4567<\/a>/);
  assert.match(menu, /<a href="mailto:events@example.test">events@example.test<\/a>/, "the email is stored in lower case");
  assert.match(home, /class="connect-band[\s\S]*<a href="tel:\+264611234567" class="text-link text-link--light">Or call \+264 61 123 4567/);
  const foot = footer(home);
  assert.match(foot, /<p>Events across nine countries with 28 partners\.<\/p>/);
  assert.match(foot, /Copyright <span data-current-year>2026<\/span> Example Holder Ltd\. All rights reserved\./);
  assert.match(foot, /href="https:\/\/x\.com\/example" class="social-link social-link--x"/);
  assert.doesNotMatch(foot, /social-link--youtube/, "an empty address hides its icon");
  assert.doesNotMatch(home, /245 5852|corporate\.events@/);

  const contact = (await request(app).get("/contact")).text;
  assert.match(contact, /<span class="contact-line-label">Main address<\/span>1 Independence Avenue, Windhoek<\/span>/);
  assert.match(contact, /maps\?q=Independence%20Avenue,%20Windhoek&amp;output=embed/);
  assert.match(contact, /<span class="contact-line-label">Email<\/span><a href="mailto:events@example.test">/);

  const post = (await request(app).get("/blog/why-namibia-is-becoming-africas-next-mice-destination")).text;
  assert.match(post, /"publisher":\{"@type":"Organization","name":"Example Holder Ltd"/, "the article JSON-LD names the copyright holder");
});

test("the notification email goes to the enquiry recipients, falling back to MAIL_TO", async () => {
  await contactJson(GENERAL).expect(201);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "team@example.test", "MAIL_TO while the setting is empty");

  await put(admin, "enquiries", { notify_to: "Sales@Example.test; events@example.test,sales@example.test" }).expect(200);
  await put(admin, "contact", CONTACT).expect(200);
  await put(admin, "seo", { ...settings.GROUPS.seo.defaults, site_name: "Zusammen MICE" }).expect(200);
  await contactJson(GENERAL).expect(201);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].to, "sales@example.test, events@example.test", "split, lower-cased and de-duplicated");
  assert.equal(sent[1].subject, "[Zusammen MICE] General enquiry from Ana Tester");
  assert.match(sent[1].text, /Zusammen MICE \| \+264 61 123 4567 \| events@example\.test/);
  assert.match(sent[1].html, /Zusammen MICE \| \+264 61 123 4567 \| events@example\.test/);

  const bad = await put(admin, "enquiries", { notify_to: "sales@example.test, not-an-address" });
  assert.equal(bad.status, 422);
  assert.match(bad.body.fieldErrors.notify_to, /not a valid email/);
});

test("reads are cached and a save clears the cache", async () => {
  assert.match((await request(app).get("/")).text, /\+264 81 245 5852/);
  // A change that bypasses the service is not seen while the cache is warm.
  await db()("settings").insert({ key: "settings.contact", value: JSON.stringify({ ...CONTACT, phone: "+264 99 999 9999" }) });
  assert.match((await request(app).get("/")).text, /\+264 81 245 5852/, "served from the cache");
  // Saving through the admin clears it: the next page shows the new value.
  await put(admin, "contact", CONTACT).expect(200);
  const home = (await request(app).get("/")).text;
  assert.match(home, /\+264 61 123 4567/);
  assert.doesNotMatch(home, /\+264 81 245 5852|\+264 99 999 9999/);
});

test("SEO: per-page titles and descriptions with live-count placeholders, and the site name everywhere", async () => {
  const seo = structuredClone(settings.GROUPS.seo.defaults);
  seo.site_name = "Zusammen MICE";
  seo.pages.faq = { title: "Questions about {destinations} destinations", description: "{partners} partners, {destinations} countries." };
  const flat = { site_name: seo.site_name, default_image_media_id: "" };
  for (const [k, p] of Object.entries(seo.pages)) Object.assign(flat, { [`pages.${k}.title`]: p.title, [`pages.${k}.description`]: p.description });
  assert.equal((await put(admin, "seo", flat)).status, 200);

  const faq = (await request(app).get("/faq")).text;
  assert.match(faq, /<title>Questions about nine destinations \| Zusammen MICE<\/title>/);
  assert.match(faq, /<meta name="description" content="28 partners, nine countries.">/);
  assert.match(faq, /<meta property="og:site_name" content="Zusammen MICE">/);
  assert.match(faq, /<meta property="og:title" content="Questions about nine destinations">/);
  assert.match((await request(app).get("/events/edulearn-2027")).text, /<title>[^<]+ \| Zusammen MICE<\/title>/);
  assert.match((await request(app).get("/no-such-page")).text, /<title>Page not found \| Zusammen MICE<\/title>/);

  const missing = await put(admin, "seo", { ...flat, "pages.faq.title": "  " });
  assert.equal(missing.status, 422);
  assert.ok(missing.body.fieldErrors["pages.faq.title"], "the error names the exact field");

  const log = await db()("audit_log").where({ entity: "settings" }).orderBy("id", "desc").first();
  assert.match(log.summary, /changed the SEO settings \(site_name, pages\.faq\.title, pages\.faq\.description\)/);
});

test("the default share image is used site-wide and survives the media clean-up", async () => {
  const [id] = await db()("media").insert({ base_url: "/uploads/2026/11/share-test", width: 1920, height: 1080, is_upload: true, created_at: new Date(Date.now() - 3 * 86400 * 1000) });
  const { pages } = settings.GROUPS.seo.defaults;
  await put(admin, "seo", { site_name: "MICE Namibia", default_image_media_id: String(id), pages }).expect(200);
  assert.match((await request(app).get("/team")).text, /<meta property="og:image" content="http:\/\/localhost:\d+\/uploads\/2026\/11\/share-test-1280\.jpg">/, "a page without its own photo");
  await media.pruneOrphans();
  assert.ok(await db()("media").where({ id }).first(), "an image only the settings use is kept");

  const gone = await put(admin, "seo", { site_name: "MICE Namibia", default_image_media_id: "999999", pages });
  assert.equal(gone.status, 422);
});

test("only admins can open or change Settings", async () => {
  assert.equal((await editor.get("/admin/settings")).status, 403);
  assert.equal((await put(editor, "contact", CONTACT)).status, 403);
  assert.doesNotMatch((await editor.get("/admin")).text, /href="\/admin\/settings"/, "editors do not see the link");
  assert.equal(await db()("settings").where({ key: "settings.contact" }).first(), undefined);

  const page = await admin.get("/admin/settings?tab=seo");
  assert.equal(page.status, 200);
  assert.match(page.text, /name="pages\.faq\.title"[^>]*data-count="120" data-warn="60"/);
  assert.match(page.text, /name="pages\.faq\.description"[^>]*data-count="300" data-warn="160"/);
  assert.match((await admin.get("/admin")).text, /href="\/admin\/settings"/);
  assert.equal((await as(admin)(admin.put("/admin/settings/nope")).send({})).status, 404);
});
