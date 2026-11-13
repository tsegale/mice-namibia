"use strict";

// Ticket tiers and per-conference prices: one price format, "Price on
// request" for any tier without a price, and the homepage ticket section
// only once the next upcoming conference has a real price.

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { request, createApp, resetDatabase, loggedInAgent, teardown, db } = require("./helpers");
const { run: seed } = require("../src/db/seeds");
const { formatPrice, parseAmount, amountInput } = require("../src/lib/money");
const { localInputValue } = require("../src/lib/dates");

const NB = String.fromCharCode(160);
let app;
let admin;
const as = (agent) => (req) => req.set("X-CSRF-Token", agent.csrf).set("X-Requested-With", "fetch").set("Accept", "application/json");
const tierId = async (name) => (await db()("pricing_tiers").where({ name }).first()).id;
const nextConference = () => db()("conferences").where({ status: "published" }).where("ends_at", ">=", new Date()).orderBy("starts_at").first();
const homeSection = (html) => (html.includes('class="section section--sand home-pricing"') ? html.slice(html.indexOf("home-pricing")) : null);

// The conference panel's PUT body for an existing event, plus price fields.
async function eventBody(c, extra = {}) {
  return {
    title: c.title,
    short_title: c.short_title,
    slug: c.slug,
    country_iso2: c.country_iso2,
    city: c.city,
    starts_local: localInputValue(c.starts_at, c.timezone),
    ends_local: localInputValue(c.ends_at, c.timezone),
    organiser: c.organiser,
    excerpt: c.excerpt,
    body: c.body,
    pull_quote: c.pull_quote || "",
    cover_media_id: c.cover_media_id,
    cover_alt: c.cover_alt || "",
    gallery: [],
    images_are_stand_ins: c.images_are_stand_ins,
    registration_url: c.registration_url || "",
    speaker_ids: [],
    status: c.status,
    ...extra,
  };
}

before(async () => {
  await resetDatabase();
  await seed(db());
  app = createApp();
  admin = await loggedInAgent(app);
});
beforeEach(() => db()("conference_prices").delete());
after(() => teardown(app));

test("prices are formatted in one place as N$ 1 250", () => {
  assert.equal(formatPrice(125000), `N$${NB}1${NB}250`);
  assert.equal(formatPrice(125050), `N$${NB}1${NB}250.50`);
  assert.equal(formatPrice(99), `N$${NB}0.99`);
  assert.equal(formatPrice(123456789), `N$${NB}1${NB}234${NB}567.89`);
  assert.equal(formatPrice(50000, "ZAR"), `R${NB}500`);
  assert.equal(formatPrice(0), `N$${NB}0`);
  assert.throws(() => formatPrice(12.5));
  assert.throws(() => formatPrice(-100));

  assert.equal(parseAmount("1250"), 125000);
  assert.equal(parseAmount("1 250"), 125000);
  assert.equal(parseAmount("1,250.5"), 125050);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12,50")));
  assert.ok(Number.isNaN(parseAmount("abc")));
  assert.ok(Number.isNaN(parseAmount("-5")));
  assert.equal(amountInput(125000), "1250");
  assert.equal(amountInput(125050), "1250.50");
});

test("the seed adds today's three tiers once, with no prices", async () => {
  const tiers = await db()("pricing_tiers").orderBy("sort_order");
  assert.deepEqual(tiers.map((t) => t.name), ["Early Bird", "Standard", "VIP"]);
  assert.deepEqual(JSON.parse(tiers[1].features), ["All Early Bird features", "Hands-on workshops", "Speaker meet & greet", "Session recordings"]);
  assert.equal(tiers.filter((t) => t.highlighted).length, 1);
  assert.equal(await db()("conference_prices").count({ n: "*" }).then(([r]) => Number(r.n)), 0);
  await db()("pricing_tiers").where({ name: "VIP" }).delete();
  await seed(db());
  assert.equal(await db()("pricing_tiers").where({ name: "VIP" }).first(), undefined, "a deleted tier is not brought back");
  await db()("pricing_tiers").insert({ name: "VIP", tagline: tiers[2].tagline, features: tiers[2].features, highlighted: false, sort_order: 2, status: "published" });
});

test("without prices every tier says Price on request and the homepage has no ticket section", async () => {
  const pricing = (await request(app).get("/pricing")).text;
  assert.equal(pricing.split('<p class="pricing-card-price">Price on request</p>').length - 1, 3);
  assert.match(pricing, /<!-- TODO: real ticket prices pending from the client/);
  const next = await nextConference();
  assert.match(pricing, new RegExp(`href="/contact\\?type=proposal&amp;event=${next.slug}&amp;tier=Early%20Bird#contact-form"`), "Request Pricing still prefills");
  assert.equal(homeSection((await request(app).get("/")).text), null);
});

test("prices are edited in the conference panel and shown on the Pricing page", async () => {
  const c = await nextConference();
  const [early, standard] = [await tierId("Early Bird"), await tierId("Standard")];
  const panel = await admin.get(`/admin/conferences/${c.id}/edit`);
  assert.match(panel.text, new RegExp(`name="prices\\.${early}\\.amount" value=""`));

  const bad = await as(admin)(admin.put(`/admin/conferences/${c.id}`)).send(await eventBody(c, { [`prices.${early}.amount`]: "twelve" }));
  assert.equal(bad.status, 422);
  assert.ok(bad.body.fieldErrors[`prices.${early}.amount`]);

  await as(admin)(admin.put(`/admin/conferences/${c.id}`)).send(await eventBody(c, { [`prices.${early}.amount`]: "1 250", [`prices.${early}.currency`]: "NAD", [`prices.${standard}.amount`]: "", [`prices.${standard}.currency`]: "NAD" })).expect(200);
  const rows = await db()("conference_prices").where({ conference_id: c.id });
  assert.deepEqual(rows.map((r) => [r.tier_id, r.amount_cents, r.currency]), [[early, 125000, "NAD"]], "integer cents; an empty amount stores nothing");

  const pricing = (await request(app).get("/pricing")).text;
  assert.match(pricing, new RegExp(`<p class="pricing-card-price" data-prices="\\{&quot;${c.slug}&quot;:&quot;N\\$${NB}1${NB}250&quot;\\}">N\\$${NB}1${NB}250</p>`));
  assert.equal(pricing.split('<p class="pricing-card-price">Price on request</p>').length - 1, 2, "the other tiers stay on request");
  assert.doesNotMatch(pricing, /<!-- TODO: real ticket prices pending/);
  assert.match(pricing, /tier=Early%20Bird#contact-form/);
  assert.match((await admin.get(`/admin/conferences/${c.id}/edit`)).text, new RegExp(`name="prices\\.${early}\\.amount" value="1250"`));

  const log = await db()("audit_log").where({ entity: "conference", entity_id: c.id }).orderBy("id", "desc").first();
  assert.equal(log.summary, `set the ticket prices for "${c.short_title}": Early Bird N$ 1 250`);

  // A save without the price table leaves the prices alone.
  const plain = await eventBody(c);
  await as(admin)(admin.put(`/admin/conferences/${c.id}`)).send(plain).expect(200);
  assert.equal(await db()("conference_prices").where({ conference_id: c.id }).count({ n: "*" }).then(([r]) => Number(r.n)), 1);
});

test("the homepage ticket section appears only when the next conference has a real price", async () => {
  const conferences = await db()("conferences").where({ status: "published" }).where("ends_at", ">=", new Date()).orderBy("starts_at");
  const [next, later] = conferences;
  const vip = await tierId("VIP");

  // A price for a later conference does not count.
  await db()("conference_prices").insert({ conference_id: later.id, tier_id: vip, amount_cents: 500000 });
  assert.equal(homeSection((await request(app).get("/")).text), null);

  await db()("conference_prices").insert({ conference_id: next.id, tier_id: vip, amount_cents: 999900, currency: "NAD" });
  const section = homeSection((await request(app).get("/")).text);
  assert.ok(section, "shown once the next conference has a price");
  assert.match(section, new RegExp(`Ticket Plans for <em class="accent">${next.short_title}</em>`), "the conference name is above the tiers");
  assert.match(section, new RegExp(`N\\$${NB}9${NB}999</p>`));
  assert.equal(section.split('<p class="pricing-card-price">Price on request</p>').length - 1, 2);
  assert.match(section, new RegExp(`event=${next.slug}&amp;tier=VIP#contact-form`));

  // A draft tier's price is never shown.
  await db()("pricing_tiers").where({ id: vip }).update({ status: "draft" });
  assert.equal(homeSection((await request(app).get("/")).text), null);
  await db()("pricing_tiers").where({ id: vip }).update({ status: "published" });
});

test("tiers are edited under Pages > Pricing, with one Most popular card", async () => {
  const vip = await tierId("VIP");
  const res = await as(admin)(admin.put(`/admin/pricing/${vip}`)).send({ name: "VIP", tagline: "Premium experience with exclusive access and VIP privileges.", features: "VIP seating\n\nPriority registration\n", highlighted: true, status: "published" });
  assert.equal(res.status, 200);
  const tiers = await db()("pricing_tiers").orderBy("sort_order");
  assert.deepEqual(tiers.filter((t) => t.highlighted).map((t) => t.name), ["VIP"]);
  assert.deepEqual(JSON.parse(tiers.find((t) => t.name === "VIP").features), ["VIP seating", "Priority registration"]);
  const pricing = (await request(app).get("/pricing")).text;
  assert.match(pricing, /<article class="pricing-card pricing-card--featured">\s*<span class="pricing-badge">Most popular<\/span>\s*<h3 class="pricing-card-name">VIP<\/h3>/);
  assert.match((await admin.get("/admin/pricing")).text, /data-sortable="\/admin\/pricing\/reorder"/);
  const log = await db()("audit_log").where({ entity: "pricing_tier" }).orderBy("id", "desc").first();
  assert.match(log.summary, /updated the ticket tier "VIP"/);
});
