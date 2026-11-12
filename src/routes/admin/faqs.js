"use strict";

// Admin > FAQs. Questions live in groups (the FAQ page sections); both are
// put in order by dragging (PATCH .../reorder). The homepage shows the first
// HOME_LIMIT published questions marked for it, in list order.

const express = require("express");
const { db } = require("../../db/knex");
const { audit } = require("../../repositories/audit");
const { HOME_LIMIT } = require("../../repositories/faqs");
const { parse, ValidationError } = require("../../validation/common");
const { faq: faqSchema, group: groupSchema } = require("../../validation/faqs");
const { cleanShort, assertCountry, nextSortOrder } = require("../../services/content");
const { uniqueSlug } = require("../../services/slugs");
const { reorderHandler } = require("./reorder");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const countries = () => db()("countries").orderBy("sort_order").select("iso2", "name");
const groupsList = () => db()("faq_groups").orderBy("sort_order").orderBy("id");

router.get(
  "/",
  wrap(async (req, res) => {
    const [groups, faqs, countryRows] = await Promise.all([groupsList(), db()("faqs").orderBy("sort_order").orderBy("id"), countries()]);
    for (const g of groups) g.faqs = faqs.filter((f) => f.group_id === g.id);
    const countryName = Object.fromEntries(countryRows.map((c) => [c.iso2, c.name]));
    // Exactly what the homepage shows, in the same order as the site.
    const marked = groups.flatMap((g) => g.faqs).filter((f) => f.status === "published" && f.show_on_home);
    const onHome = new Set(marked.slice(0, HOME_LIMIT).map((f) => f.id));
    const open = req.query.new ? "/admin/faqs/new" : req.query.edit ? `/admin/faqs/${Number(req.query.edit)}/edit` : null;
    res.render("admin/faqs/list", { title: "FAQs", groups, countryName, markedCount: marked.length, onHome, homeLimit: HOME_LIMIT, open });
  })
);

/* Questions ----------------------------------------------------------------- */

async function formData(f) {
  const [groups, countryRows] = await Promise.all([groupsList(), countries()]);
  return { f, groups, countries: countryRows, homeLimit: HOME_LIMIT };
}

router.get(
  "/new",
  wrap(async (req, res) => {
    const groupId = Number(req.query.group) || null;
    res.render("admin/faqs/form", await formData({ status: "draft", group_id: groupId, show_on_home: false }));
  })
);

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const f = await db()("faqs").where({ id: req.params.id }).first();
    if (!f) return next();
    res.render("admin/faqs/form", await formData(f));
  })
);

async function saveFaq(req, existing) {
  const data = parse(faqSchema, req.body);
  const answer = cleanShort(data.answer, "answer", "Answer");
  if (!(await db()("faq_groups").where({ id: data.group_id }).first())) throw new ValidationError({ group_id: "Choose a group from the list." });
  await assertCountry(db(), data.country_iso2);
  const row = {
    group_id: data.group_id,
    question: data.question,
    answer,
    country_iso2: data.country_iso2,
    show_on_home: data.show_on_home,
    status: data.status,
  };
  let id = existing?.id;
  if (existing) {
    // Moving to another group puts the question at the end of that group.
    if (existing.group_id !== row.group_id) row.sort_order = await nextSortOrder(db(), "faqs", { group_id: row.group_id });
    await db()("faqs").where({ id }).update(row);
  } else {
    row.sort_order = await nextSortOrder(db(), "faqs", { group_id: row.group_id });
    [id] = await db()("faqs").insert(row);
  }
  await audit(req, { action: existing ? "update" : "create", entity: "faq", entityId: id, summary: `${existing ? "updated" : "added"} the question "${row.question}"` });
  return row;
}

router.post(
  "/",
  wrap(async (req, res) => {
    const row = await saveFaq(req, null);
    res.status(201).json({ ok: true, message: row.status === "published" ? "Question published" : "Question saved as a draft" });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("faqs").where({ id: req.params.id }).first();
    if (!existing) return next();
    const row = await saveFaq(req, existing);
    res.json({ ok: true, message: row.status === "published" ? "Question saved and live" : "Question saved as a draft" });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("faqs").where({ id: req.params.id }).first();
    if (!existing) return next();
    await db()("faqs").where({ id: existing.id }).delete();
    await audit(req, { action: "delete", entity: "faq", entityId: existing.id, summary: `deleted the question "${existing.question}"` });
    res.json({ ok: true, message: "Question deleted" });
  })
);

router.patch("/reorder", reorderHandler({ table: "faqs", entity: "faq", label: "FAQ questions", scope: "group_id" }));

/* Groups --------------------------------------------------------------------- */

router.patch("/groups/reorder", reorderHandler({ table: "faq_groups", entity: "faq_group", label: "FAQ groups" }));

router.get("/groups/new", (req, res) => res.render("admin/faqs/group-form", { g: {}, questionCount: 0 }));

router.get(
  "/groups/:id/edit",
  wrap(async (req, res, next) => {
    const g = await db()("faq_groups").where({ id: req.params.id }).first();
    if (!g) return next();
    const [{ n }] = await db()("faqs").where({ group_id: g.id }).count({ n: "*" });
    res.render("admin/faqs/group-form", { g, questionCount: Number(n) });
  })
);

router.post(
  "/groups",
  wrap(async (req, res) => {
    const { name } = parse(groupSchema, req.body);
    // The slug is the page anchor (/faq#faq-<slug>). It is set once, so
    // renaming a group never breaks links to it.
    const slug = await uniqueSlug("faq_groups", name);
    const [id] = await db()("faq_groups").insert({ name, slug, sort_order: await nextSortOrder(db(), "faq_groups") });
    await audit(req, { action: "create", entity: "faq_group", entityId: id, summary: `added the FAQ group "${name}"` });
    res.status(201).json({ ok: true, message: "Group added" });
  })
);

router.put(
  "/groups/:id",
  wrap(async (req, res, next) => {
    const g = await db()("faq_groups").where({ id: req.params.id }).first();
    if (!g) return next();
    const { name } = parse(groupSchema, req.body);
    await db()("faq_groups").where({ id: g.id }).update({ name });
    await audit(req, { action: "update", entity: "faq_group", entityId: g.id, summary: `renamed the FAQ group "${g.name}" to "${name}"` });
    res.json({ ok: true, message: "Group saved" });
  })
);

router.delete(
  "/groups/:id",
  wrap(async (req, res, next) => {
    const g = await db()("faq_groups").where({ id: req.params.id }).first();
    if (!g) return next();
    if (await db()("faqs").where({ group_id: g.id }).first()) {
      throw new ValidationError({}, "Move or delete the questions in this group first. A group with questions in it cannot be deleted.");
    }
    await db()("faq_groups").where({ id: g.id }).delete();
    await audit(req, { action: "delete", entity: "faq_group", entityId: g.id, summary: `deleted the FAQ group "${g.name}"` });
    res.json({ ok: true, message: "Group deleted" });
  })
);

module.exports = router;
