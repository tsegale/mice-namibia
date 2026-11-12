"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { request, createApp, resetDatabase, teardown, db } = require("./helpers");
const { run: seed } = require("../src/db/seeds");
const config = require("../src/config");

let app;
before(async () => {
  await resetDatabase();
  await seed(db());
  app = createApp();
});
after(() => teardown(app));

const PAGES = ["/", "/about", "/services", "/events", "/blog", "/venues", "/gallery", "/faq", "/partners", "/pricing", "/contact", "/team", "/privacy-policy", "/terms-and-conditions"];

test("every fixed page renders", async () => {
  for (const path of PAGES) {
    const res = await request(app).get(path);
    assert.equal(res.status, 200, path);
    assert.match(res.text, /<main id="main"/, path);
  }
});

test("conference, article and venue pages render from the database", async () => {
  const ev = await request(app).get("/events/edulearn-2027");
  assert.equal(ev.status, 200);
  assert.match(ev.text, /International Conference on Education and New Learning Technologies/);
  assert.match(ev.text, /datetime="2027-01-08T08:30:00\+02:00"/, "shown in the event's own timezone");
  assert.match(ev.text, /"@type":"Event"/);

  const post = await request(app).get("/blog/why-namibia-is-becoming-africas-next-mice-destination");
  assert.equal(post.status, 200);
  assert.match(post.text, /<h2 id="a-new-chapter-for-namibias-business-events-industry">/);

  const venue = await request(app).get("/venues/wicc");
  assert.equal(venue.status, 200);
  assert.match(venue.text, /Windhoek International Convention Centre/);
});

test("drafts and scheduled posts are not public", async () => {
  await db()("posts").where({ slug: "why-namibia-is-perfect-for-incentive-travel" }).update({ status: "draft" });
  await db()("posts").where({ slug: "best-team-building-activities-in-namibia-for-corporate-groups" }).update({ published_at: new Date(Date.now() + 86400000) });
  assert.equal((await request(app).get("/blog/why-namibia-is-perfect-for-incentive-travel")).status, 404);
  assert.equal((await request(app).get("/blog/best-team-building-activities-in-namibia-for-corporate-groups")).status, 404);
  const listing = await request(app).get("/blog");
  assert.doesNotMatch(listing.text, /Why Namibia Is Perfect for Incentive Travel/);
  assert.doesNotMatch(listing.text, /Best Team-Building Activities/);
});

test("past conferences drop off the upcoming lists", async () => {
  // Pin the other two in the future relative to today, so this test does not
  // start failing once the seeded January 2027 dates have passed. The real
  // dates are put back afterwards for the calendar-file test.
  const DAY = 86400000;
  const original = await db()("conferences").select("id", "starts_at", "ends_at");
  try {
    await db()("conferences").whereNot({ slug: "icsdeg-2027" }).update({ starts_at: new Date(Date.now() + 30 * DAY), ends_at: new Date(Date.now() + 30 * DAY + 7 * 3600000) });
    await db()("conferences").where({ slug: "icsdeg-2027" }).update({ starts_at: new Date("2020-01-01T08:00:00Z"), ends_at: new Date("2020-01-01T15:00:00Z") });
    const events = await request(app).get("/events");
    assert.doesNotMatch(events.text, /Sustainable Development and Economic Growth/);
    const home = await request(app).get("/");
    assert.match(home.text, /data-count-to="2" data-conference-count>2</);
  } finally {
    for (const row of original) await db()("conferences").where({ id: row.id }).update({ starts_at: row.starts_at, ends_at: row.ends_at });
  }
});

test("old .html addresses redirect permanently to the new ones", async () => {
  const cases = {
    "/index.html": "/",
    "/about.html": "/about",
    "/event-edulearn-2027.html": "/events/edulearn-2027",
    "/blog-01.html": "/blog/why-namibia-is-becoming-africas-next-mice-destination",
    "/venue-wicc.html": "/venues/wicc",
    "/sponsors.html": "/partners",
  };
  for (const [from, to] of Object.entries(cases)) {
    const res = await request(app).get(from);
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.location, to, from);
  }
  const withQuery = await request(app).get("/contact.html?type=proposal");
  assert.equal(withQuery.headers.location, "/contact?type=proposal");
});

test("unknown pages get the branded 404", async () => {
  const res = await request(app).get("/does-not-exist");
  assert.equal(res.status, 404);
  assert.match(res.text, /<main id="main"/);
});

test("calendar file, sitemap and robots", async () => {
  const ics = await request(app).get("/events/edulearn-2027.ics");
  assert.equal(ics.status, 200);
  assert.match(ics.headers["content-type"], /text\/calendar/);
  assert.match(ics.text, /DTSTART:20270108T063000Z\r\n/);

  const map = await request(app).get("/sitemap.xml");
  assert.ok(map.text.includes(`<loc>${config.baseUrl}/venues/wicc</loc>`), "sitemap uses BASE_URL");

  const robots = await request(app).get("/robots.txt");
  assert.match(robots.text, /Disallow: \//, "non-production sites are not indexed");
});

test("content is escaped when rendered", async () => {
  await db()("venues").where({ slug: "movenpick" }).update({ name: '<script>alert("x")</script>' });
  const res = await request(app).get("/venues");
  assert.doesNotMatch(res.text, /<script>alert/);
  assert.match(res.text, /&lt;script&gt;alert/);
});
