"use strict";

// Admin > Partners: the logo grid on the Partners page, and the "Trusted by"
// strip on the homepage, About and FAQ pages (partners marked for it). The
// order is set by dragging (PATCH /admin/partners/reorder).

const express = require("express");
const { db } = require("../../db/knex");
const media = require("../../repositories/media");
const { audit } = require("../../repositories/audit");
const { parse, ValidationError } = require("../../validation/common");
const { partner: schema } = require("../../validation/partners");
const { assertMedia, assertCountry, nextSortOrder } = require("../../services/content");
const { reorderHandler } = require("./reorder");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const countries = () => db()("countries").orderBy("sort_order").select("iso2", "name");

router.get(
  "/",
  wrap(async (req, res) => {
    const [rows, countryRows] = await Promise.all([
      db()("partners").orderBy("sort_order").orderBy("id").then((r) => media.attach(r, "logo_media_id", "logo")),
      countries(),
    ]);
    const countryName = Object.fromEntries(countryRows.map((c) => [c.iso2, c.name]));
    const published = rows.filter((p) => p.status === "published");
    const open = req.query.new ? "/admin/partners/new" : req.query.edit ? `/admin/partners/${Number(req.query.edit)}/edit` : null;
    res.render("admin/partners/list", {
      title: "Partners",
      rows,
      countryName,
      publishedCount: published.length,
      marqueeCount: published.filter((p) => p.show_in_marquee).length,
      open,
    });
  })
);

async function formData(p) {
  const logo = p.logo_media_id ? (await media.byIds([p.logo_media_id])).get(p.logo_media_id) : null;
  return { p, logo, countries: await countries() };
}

router.get("/new", wrap(async (req, res) => res.render("admin/partners/form", await formData({ status: "draft", show_in_marquee: false, dark_background: false }))));

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const p = await db()("partners").where({ id: req.params.id }).first();
    if (!p) return next();
    res.render("admin/partners/form", await formData(p));
  })
);

async function save(req, existing) {
  const data = parse(schema, req.body);
  if (data.status === "published" && !data.logo_media_id) {
    throw new ValidationError({ logo_media_id: "Add the logo before publishing. Until then, save as a draft." });
  }
  await assertMedia([data.logo_media_id], "logo_media_id");
  await assertCountry(db(), data.country_iso2);
  const row = {
    name: data.name,
    logo_media_id: data.logo_media_id,
    website_url: data.website_url,
    country_iso2: data.country_iso2,
    dark_background: data.dark_background,
    show_in_marquee: data.show_in_marquee,
    status: data.status,
  };
  let id = existing?.id;
  if (existing) {
    await db()("partners").where({ id }).update(row);
    if (existing.logo_media_id !== row.logo_media_id) await media.releaseIfUnused([existing.logo_media_id]);
  } else {
    row.sort_order = await nextSortOrder(db(), "partners");
    [id] = await db()("partners").insert(row);
  }
  await audit(req, { action: existing ? "update" : "create", entity: "partner", entityId: id, summary: `${existing ? "updated" : "added"} the partner "${row.name}"` });
  return row;
}

router.post(
  "/",
  wrap(async (req, res) => {
    const row = await save(req, null);
    res.status(201).json({ ok: true, message: row.status === "published" ? "Partner published" : "Partner saved as a draft" });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("partners").where({ id: req.params.id }).first();
    if (!existing) return next();
    const row = await save(req, existing);
    res.json({ ok: true, message: row.status === "published" ? "Partner saved and live" : "Partner saved as a draft" });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("partners").where({ id: req.params.id }).first();
    if (!existing) return next();
    await db()("partners").where({ id: existing.id }).delete();
    await media.releaseIfUnused([existing.logo_media_id]);
    await audit(req, { action: "delete", entity: "partner", entityId: existing.id, summary: `deleted the partner "${existing.name}"` });
    res.json({ ok: true, message: "Partner deleted" });
  })
);

router.patch("/reorder", reorderHandler({ table: "partners", entity: "partner", label: "partners" }));

module.exports = router;
