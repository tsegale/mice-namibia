"use strict";

// Destinations: the countries table drives every destination list on the
// site and the contact form's validation.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { request, createApp, resetDatabase, loggedInAgent, csrfFrom, teardown, db } = require("./helpers");
const { run: seed } = require("../src/db/seeds");
const { hashPassword } = require("../src/services/auth");

const SITE_ORDER = ["na", "bw", "za", "zm", "zw", "ke", "tz", "ug", "rw"];
const EDITOR = { email: "editor@example.test", password: "editor-horse-42-battery" };

let app;
let admin;
let editor;
const as = (agent) => (req) => req.set("X-CSRF-Token", agent.csrf).set("X-Requested-With", "fetch").set("Accept", "application/json");
const contactJson = (body) => request(app).post("/contact").set("Accept", "application/json").set("X-Requested-With", "fetch").set("Sec-Fetch-Site", "same-origin").send(body);
const PROPOSAL = { enquiry_type: "proposal", first_name: "Ana", last_name: "Tester", email: "ana@example.test", phone: "+264 81 000 0000", event_type: "Conference", message: "We need a venue." };

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
// Adding a country needs its flag file; the tests add a temporary one.
const FLAGS = path.join(__dirname, "..", "public", "assets", "images", "flags");
const TEMP_FLAG = path.join(FLAGS, "mz.svg");
const withTempFlag = async (fn) => {
  fs.copyFileSync(path.join(FLAGS, "na.svg"), TEMP_FLAG);
  try {
    return await fn();
  } finally {
    fs.rmSync(TEMP_FLAG, { force: true });
  }
};
after(async () => {
  fs.rmSync(TEMP_FLAG, { force: true });
  await teardown(app);
});

const footerFlags = (html) => [...html.slice(html.indexOf('class="container footer-flags"')).matchAll(/flags\/([a-z]{2})\.svg/g)].map((m) => m[1]);

test("the seed fills the destination details once and keeps the site order", async () => {
  assert.deepEqual(await db()("countries").orderBy("sort_order").pluck("iso2"), SITE_ORDER);
  const na = await db()("countries").where({ iso2: "na" }).first();
  assert.equal(na.hook, "Modern business facilities, spectacular landscapes and wildlife");
  assert.equal(na.cities, "Windhoek, Swakopmund, Walvis Bay");
  assert.ok(na.photo_media_id);
  await db()("countries").where({ iso2: "na" }).update({ hook: "Edited in the admin" });
  await seed(db());
  assert.equal((await db()("countries").where({ iso2: "na" }).first()).hook, "Edited in the admin", "a later seed never overwrites");
  await db()("countries").where({ iso2: "na" }).update({ hook: na.hook });
});

test("every destination list on the site reads from the database", async () => {
  const home = (await request(app).get("/")).text;
  const mosaic = home.slice(home.indexOf('<ul class="dest-mosaic"'), home.indexOf("</ul>", home.indexOf('<ul class="dest-mosaic"')));
  assert.deepEqual([...mosaic.matchAll(/flags\/([a-z]{2})\.svg/g)].map((m) => m[1]), SITE_ORDER);
  assert.match(mosaic, /<li class="dest-tile dest-tile--feature">\s*<a href="\/contact\?type=proposal&amp;destination=Namibia#contact-form"/);
  assert.match(home, /across Namibia, Botswana, South Africa, Zambia, Zimbabwe, Kenya, Tanzania, Uganda, and Rwanda\./);
  assert.deepEqual(footerFlags(home), SITE_ORDER);

  const contact = (await request(app).get("/contact")).text;
  assert.deepEqual([...contact.matchAll(/<option value="([^"]+)"[^>]*>\1<\/option>/g)].map((m) => m[1]).filter((n) => /^[A-Z]/.test(n) && !/Meeting|Incentive|Conference|Exhibition|Other|Corporate|Event|Destination|Accommodation|Transportation|Post/.test(n)), ["Namibia", "Botswana", "South Africa", "Zambia", "Zimbabwe", "Kenya", "Tanzania", "Uganda", "Rwanda"]);
  assert.match(contact, /<li><a href="\/contact\?type=proposal&amp;destination=South%20Africa#contact-form"><img src="\/assets\/images\/flags\/za.svg" alt="" width="24" height="18">South Africa<\/a><\/li>/);
  assert.match((await request(app).get("/services")).text, /<span class="reach-tile-name">Kenya<\/span>\s*<span class="reach-tile-cities">Nairobi<\/span>/);
  assert.match((await request(app).get("/venues")).text, /data-value="ug" aria-pressed="false" disabled>/);
});

test("the contact form validates the destination against the database", async () => {
  assert.equal((await contactJson({ ...PROPOSAL, destination: "Namibia" })).status, 201);
  const bad = await contactJson({ ...PROPOSAL, destination: "Atlantis" });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.fieldErrors.destination);

  // Switched off in the admin: gone from the form, the lists and the count.
  assert.equal((await as(admin)(admin.put("/admin/destinations/rw")).send({ name: "Rwanda", is_destination: false })).status, 200);
  assert.equal((await contactJson({ ...PROPOSAL, destination: "Rwanda" })).status, 422);
  const home = (await request(app).get("/")).text;
  assert.ok(!footerFlags(home).includes("rw"));
  assert.match(home, /<p class="footer-flags-label">Eight destinations<\/p>/);
  assert.match(home, /Tanzania, and Uganda\./);

  // Added from the flag list: accepted straight away.
  const added = await withTempFlag(() => as(admin)(admin.post("/admin/destinations")).send({ iso2: "mz", timezone: "Africa/Maputo", name: "Mozambique", hook: "Beaches and island lodges", is_destination: true }));
  assert.equal(added.status, 201);
  assert.equal((await contactJson({ ...PROPOSAL, destination: "Mozambique" })).status, 201);
  assert.deepEqual(footerFlags((await request(app).get("/")).text).slice(-1), ["mz"], "added at the end");

  await as(admin)(admin.put("/admin/destinations/rw")).send({ name: "Rwanda", is_destination: true });
  await db()("countries").where({ iso2: "mz" }).delete();
  await db()("submissions").delete();
});

test("a destination that venues or events use cannot be switched off", async () => {
  const res = await as(admin)(admin.put("/admin/destinations/na")).send({ name: "Namibia", is_destination: false });
  assert.equal(res.status, 422);
  assert.match(res.body.fieldErrors.is_destination, /Namibia is used by venues: .*WICC.*; events: .*EDULEARN/);
  assert.equal((await db()("countries").where({ iso2: "na" }).first()).is_destination, true, "still a destination");
  // Renaming and other edits are fine.
  const ok = await as(admin)(admin.put("/admin/destinations/na")).send({ name: "Namibia", hook: "Desert, coast and conference halls", is_destination: true });
  assert.equal(ok.status, 200);
  assert.match((await request(app).get("/")).text, /<span class="dest-tile-hook">Desert, coast and conference halls<\/span>/);
  assert.ok(await db()("audit_log").where({ entity: "country", action: "update" }).first());
});

test("countries can only be added from the shipped flag files, once", async () => {
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "public", "assets", "images", "flags", "xx.svg")));
  assert.equal((await as(admin)(admin.post("/admin/destinations")).send({ iso2: "xx", timezone: "Africa/Windhoek", name: "Nowhere" })).status, 422);
  assert.equal((await as(admin)(admin.post("/admin/destinations")).send({ iso2: "na", timezone: "Africa/Windhoek", name: "Namibia again" })).status, 422);
  // Today every shipped flag is in use, so there is nothing to add yet.
  const none = await admin.get("/admin/destinations/new");
  assert.match(none.text, /Every country the site has a flag for is already in the list/);
  assert.doesNotMatch(none.text, /type="submit"/);
  await withTempFlag(async () => {
    assert.equal((await as(admin)(admin.post("/admin/destinations")).send({ iso2: "mz", timezone: "Not/AZone", name: "Mozambique" })).status, 422, "the timezone comes from the list");
    const form = await admin.get("/admin/destinations/new");
    assert.match(form.text, /<option value="mz">Mozambique \(MZ\)<\/option>/);
    assert.doesNotMatch(form.text, /<option value="na">/, "countries already in the list are not offered");
  });
});

test("destinations reorder by code, and editors can manage them", async () => {
  const order = [...SITE_ORDER];
  [order[1], order[2]] = [order[2], order[1]];
  assert.equal((await as(editor)(editor.patch("/admin/destinations/reorder")).send({ ids: order })).status, 200);
  assert.deepEqual(footerFlags((await request(app).get("/")).text), order);
  assert.equal((await as(editor)(editor.patch("/admin/destinations/reorder")).send({ ids: order.slice(1) })).status, 422, "a partial list is refused");
  assert.equal((await as(editor)(editor.patch("/admin/destinations/reorder")).send({ ids: [1, 2, 3] })).status, 422, "numeric ids are refused");
  assert.equal((await editor.get("/admin/destinations")).status, 200);
  await as(editor)(editor.patch("/admin/destinations/reorder")).send({ ids: SITE_ORDER });
});
