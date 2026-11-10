"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { request, createApp, resetDatabase, loggedInAgent, teardown, db } = require("./helpers");
const { run: seed } = require("../src/db/seeds");
const config = require("../src/config");

let app;
let agent;
const json = (req) => req.set("X-CSRF-Token", agent.csrf).set("X-Requested-With", "fetch").set("Accept", "application/json");

before(async () => {
  fs.rmSync(config.uploads.dir, { recursive: true, force: true });
  await resetDatabase();
  await seed(db());
  app = createApp();
  agent = await loggedInAgent(app);
});
after(async () => {
  fs.rmSync(config.uploads.dir, { recursive: true, force: true });
  await teardown(app);
});

async function upload(file) {
  const res = await json(agent.post("/admin/media")).attach("file", path.join(__dirname, "fixtures", file));
  return res;
}

/* Media ------------------------------------------------------------------------ */

test("uploads are resized to WebP and JPG variants and never upscaled", async () => {
  const res = await upload("photo.jpg");
  assert.equal(res.status, 201);
  const m = await db()("media").where({ id: res.body.media.id }).first();
  assert.equal(m.widths, "640,1280,1920");
  assert.match(m.base_url, /^\/uploads\/\d{4}\/\d{2}\/[a-f0-9]{12}-photo$/);
  for (const w of [640, 1280, 1920]) {
    for (const f of ["webp", "jpg"]) assert.ok(fs.existsSync(path.join(config.uploads.dir, m.base_url.replace("/uploads/", "") + `-${w}.${f}`)), `${w}.${f}`);
  }
  const small = await upload("small.png");
  const s = await db()("media").where({ id: small.body.media.id }).first();
  assert.equal(s.widths, "400", "a 400px image keeps its own size");
  const served = await request(app).get(`${m.base_url}-640.webp`);
  assert.equal(served.status, 200);
});

test("files that are not images are rejected by content, not by name", async () => {
  const res = await upload("fake.jpg");
  assert.equal(res.status, 400);
  assert.match(res.body.error, /not a JPG, PNG, WebP or GIF/);
});

test("uploads need the CSRF token", async () => {
  const res = await agent.post("/admin/media").set("Accept", "application/json").set("X-Requested-With", "fetch").attach("file", path.join(__dirname, "fixtures", "photo.jpg"));
  assert.equal(res.status, 403);
});

test("importing from a private address is refused", async () => {
  const res = await json(agent.post("/admin/media/import")).send({ url: "http://127.0.0.1/secret.jpg" });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /private network/);
});

/* Events ------------------------------------------------------------------------- */

async function newEventBody(overrides = {}) {
  const cover = (await upload("photo.jpg")).body.media.id;
  return {
    title: "Africa Tourism Leadership Forum",
    short_title: "ATLF 2027",
    slug: "",
    country_iso2: "ke",
    city: "Nairobi",
    starts_local: "2027-03-02T09:00",
    ends_local: "2027-03-02T17:00",
    organiser: "Example Org",
    excerpt: "A one-day forum for tourism leaders.",
    body: "<p>Hello <script>alert(1)</script><b>world</b></p>",
    pull_quote: "",
    cover_media_id: cover,
    cover_alt: "Delegates in a hall",
    gallery: [],
    images_are_stand_ins: false,
    registration_url: "",
    speaker_ids: [],
    status: "published",
    ...overrides,
  };
}

test("an event can be created, appears on the site in its own timezone, and is cleaned", async () => {
  const res = await json(agent.post("/admin/conferences")).send(await newEventBody());
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const row = await db()("conferences").where({ slug: "atlf-2027" }).first();
  assert.equal(row.timezone, "Africa/Nairobi", "timezone comes from the country");
  assert.equal(row.starts_at.toISOString(), "2027-03-02T06:00:00.000Z");
  assert.equal(row.body, "<p>Hello <strong>world</strong></p>");
  const page = await request(app).get("/events/atlf-2027");
  assert.equal(page.status, 200);
  assert.match(page.text, /datetime="2027-03-02T09:00:00\+03:00"/);
});

test("event validation returns a message per field", async () => {
  const res = await json(agent.post("/admin/conferences")).send({ title: "", status: "published", starts_local: "2027-01-02T10:00", ends_local: "2027-01-02T09:00" });
  assert.equal(res.status, 422);
  assert.ok(res.body.fieldErrors.title);
  assert.ok(res.body.fieldErrors.cover_media_id);
  assert.equal(res.body.fieldErrors.ends_local, "The end must be after the start.");
});

test("renaming an event's slug keeps the old address working", async () => {
  const row = await db()("conferences").where({ slug: "edulearn-2027" }).first();
  const edit = await agent.get(`/admin/conferences/${row.id}/edit`);
  assert.equal(edit.status, 200);
  const body = await newEventBody({ title: row.title, short_title: row.short_title, slug: "edulearn-namibia-2027", country_iso2: "na", city: "Swakopmund", starts_local: "2027-01-08T08:30", ends_local: "2027-01-08T15:30", cover_media_id: row.cover_media_id });
  const res = await json(agent.put(`/admin/conferences/${row.id}`)).send(body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const old = await request(app).get("/events/edulearn-2027");
  assert.equal(old.status, 301);
  assert.equal(old.headers.location, "/events/edulearn-namibia-2027");
  const legacy = await request(app).get("/event-edulearn-2027.html");
  assert.equal(legacy.headers.location, "/events/edulearn-namibia-2027", "older redirects are repointed, no chains");
});

test("deleting an event removes it and its now-unused uploads", async () => {
  const body = await newEventBody({ short_title: "Delete Me 2027", status: "draft" });
  await json(agent.post("/admin/conferences")).send(body);
  const row = await db()("conferences").where({ slug: "delete-me-2027" }).first();
  const m = await db()("media").where({ id: row.cover_media_id }).first();
  const res = await json(agent.delete(`/admin/conferences/${row.id}`));
  assert.equal(res.status, 200);
  assert.equal(await db()("conferences").where({ id: row.id }).first(), undefined);
  assert.equal(await db()("media").where({ id: m.id }).first(), undefined);
  assert.ok(!fs.existsSync(path.join(config.uploads.dir, m.base_url.replace("/uploads/", "") + "-640.jpg")));
});

/* Venues ---------------------------------------------------------------------------- */

test("a venue with tags and gallery can be created and filtered on the site", async () => {
  const card = (await upload("photo.jpg")).body.media.id;
  const g1 = (await upload("photo.jpg")).body.media.id;
  const g2 = (await upload("small.png")).body.media.id;
  const cat = await db()("venue_categories").where({ name: "Hotels" }).first();
  const tags = await db()("venue_tags").whereIn("name", ["Boardrooms", "Luxury hotels"]).pluck("id");
  const res = await json(agent.post("/admin/venues")).send({
    name: "Test Lodge",
    full_name: "",
    category_id: cat.id,
    tag_ids: tags.map(String),
    city: "Swakopmund",
    country_iso2: "na",
    description: "<p>A lodge by the sea.</p>",
    map_query: "",
    card_media_id: card,
    gallery: [
      { media_id: g1, alt: "Lobby" },
      { media_id: g2, alt: "Pool" },
    ],
    featured_on_home: false,
    sort_order: 9,
    status: "published",
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const v = await db()("venues").where({ slug: "test-lodge" }).first();
  assert.equal(v.map_query, "Test Lodge, Swakopmund, Namibia");
  assert.deepEqual(await db()("venue_images").where({ venue_id: v.id }).orderBy("sort_order").pluck("alt"), ["Lobby", "Pool"]);
  const listing = await request(app).get("/venues");
  assert.match(listing.text, /data-tags="Luxury hotels\|Boardrooms"|data-tags="Boardrooms\|Luxury hotels"/);
  const page = await request(app).get("/venues/test-lodge");
  assert.equal(page.status, 200);
  assert.match(page.text, /1 of 2: Lobby/);
});

/* Blog ----------------------------------------------------------------------------- */

test("a scheduled article stays hidden until its time, with reading time worked out", async () => {
  const cover = (await upload("photo.jpg")).body.media.id;
  const words = Array(660).fill("word").join(" ");
  const res = await json(agent.post("/admin/posts")).send({
    title: "Future Article",
    slug: "",
    category_id: "",
    new_category: "Industry News",
    excerpt: "Coming soon.",
    body: `<h2>Part one</h2><p>${words}</p>`,
    cover_media_id: cover,
    author_name: "Zusammen Travels MICE",
    status: "published",
    published_local: "2099-01-01T09:00",
    services_position: "",
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.message, "Article scheduled");
  const p = await db()("posts").where({ slug: "future-article" }).first();
  assert.equal(p.reading_minutes, 3);
  assert.ok(await db()("post_categories").where({ name: "Industry News" }).first(), "new category created");
  assert.equal((await request(app).get("/blog/future-article")).status, 404);
  await db()("posts").where({ id: p.id }).update({ published_at: new Date(Date.now() - 1000) });
  assert.equal((await request(app).get("/blog/future-article")).status, 200);
});

test("a Services page position moves from one article to another", async () => {
  const holder = await db()("posts").where({ services_position: 1 }).first();
  const other = await db()("posts").whereNull("services_position").where("status", "published").first();
  const body = {
    title: other.title,
    slug: other.slug,
    category_id: other.category_id,
    excerpt: other.excerpt,
    body: other.body,
    cover_media_id: other.cover_media_id,
    cover_alt: other.cover_alt,
    author_name: other.author_name,
    status: "published",
    published_local: "2026-01-01T09:00",
    services_position: "1",
  };
  const res = await json(agent.put(`/admin/posts/${other.id}`)).send(body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await db()("posts").where({ id: holder.id }).first()).services_position, null);
  assert.equal((await db()("posts").where({ id: other.id }).first()).services_position, 1);
});

/* Speakers ------------------------------------------------------------------------- */

test("a real speaker cannot be published without consent, and replaces the samples once live", async () => {
  const base = { name: "Dr Ada Example", role: "Keynote Speaker", organisation: "University of Namibia", bio: "", linkedin_url: "", website_url: "", show_on_home: true, sort_order: 0 };
  const blocked = await json(agent.post("/admin/speakers")).send({ ...base, status: "published", consent_confirmed: false });
  assert.equal(blocked.status, 422);
  assert.match(blocked.body.fieldErrors.consent_confirmed, /agreed/);

  const home = await request(app).get("/");
  assert.match(home.text, /speaker-sample-badge/);

  const ok = await json(agent.post("/admin/speakers")).send({ ...base, status: "published", consent_confirmed: true });
  assert.equal(ok.status, 201);
  const after = await request(app).get("/");
  assert.match(after.text, /Dr Ada Example/);
  assert.doesNotMatch(after.text, /speaker-sample-badge/, "samples are hidden once a real speaker is live");
});

/* Access ------------------------------------------------------------------------------ */

test("content changes are recorded in the audit log", async () => {
  const actions = await db()("audit_log").whereIn("entity", ["conference", "venue", "post", "speaker"]).pluck("action");
  assert.ok(actions.includes("create") && actions.includes("update") && actions.includes("delete"));
});

test("admin JSON endpoints reject logged-out requests", async () => {
  const res = await request(app).post("/admin/posts").set("Accept", "application/json").set("X-Requested-With", "fetch").send({});
  assert.equal(res.status, 401);
});
