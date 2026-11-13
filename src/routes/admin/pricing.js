"use strict";

// Admin > Pages > Pricing: the ticket tiers (name, tagline, features, "Most
// popular") on the Pricing page and the homepage ticket section. Prices are
// per conference and are entered in the conference panel. The order is set
// by dragging (PATCH /admin/pricing/reorder).

const express = require("express");
const { db } = require("../../db/knex");
const { audit } = require("../../repositories/audit");
const pricing = require("../../repositories/pricing");
const { parse } = require("../../validation/common");
const { tier: schema } = require("../../validation/pricing");
const { nextSortOrder } = require("../../services/content");
const { reorderHandler } = require("./reorder");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get(
  "/",
  wrap(async (req, res) => {
    const rows = await pricing.tiers();
    const counts = Object.fromEntries((await db()("conference_prices").select("tier_id").count({ n: "*" }).groupBy("tier_id")).map((r) => [r.tier_id, Number(r.n)]));
    const open = req.query.new ? "/admin/pricing/new" : req.query.edit ? `/admin/pricing/${Number(req.query.edit)}/edit` : null;
    res.render("admin/pricing/list", { title: "Pricing", rows, counts, open });
  })
);

router.get("/new", (req, res) => res.render("admin/pricing/form", { t: { status: "draft", features: [] } }));

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const t = (await pricing.tiers()).find((x) => x.id === Number(req.params.id));
    if (!t) return next();
    res.render("admin/pricing/form", { t });
  })
);

async function save(req, existing) {
  const data = parse(schema, req.body);
  const row = { name: data.name, tagline: data.tagline, features: JSON.stringify(data.features), highlighted: data.highlighted, status: data.status };
  let id = existing?.id;
  await db().transaction(async (trx) => {
    // One "Most popular" card at most.
    if (row.highlighted) await trx("pricing_tiers").whereNot({ id: id || 0 }).update({ highlighted: false });
    if (existing) {
      await trx("pricing_tiers").where({ id }).update(row);
    } else {
      row.sort_order = await nextSortOrder(trx, "pricing_tiers");
      [id] = await trx("pricing_tiers").insert(row);
    }
  });
  await audit(req, { action: existing ? "update" : "create", entity: "pricing_tier", entityId: id, summary: `${existing ? "updated" : "added"} the ticket tier "${row.name}"` });
  return row;
}

router.post(
  "/",
  wrap(async (req, res) => {
    const row = await save(req, null);
    res.status(201).json({ ok: true, message: row.status === "published" ? "Tier published" : "Tier saved as a draft" });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("pricing_tiers").where({ id: req.params.id }).first();
    if (!existing) return next();
    const row = await save(req, existing);
    res.json({ ok: true, message: row.status === "published" ? "Tier saved and live" : "Tier saved as a draft" });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("pricing_tiers").where({ id: req.params.id }).first();
    if (!existing) return next();
    const prices = Number((await db()("conference_prices").where({ tier_id: existing.id }).count({ n: "*" }))[0].n);
    await db()("pricing_tiers").where({ id: existing.id }).delete();
    await audit(req, { action: "delete", entity: "pricing_tier", entityId: existing.id, summary: `deleted the ticket tier "${existing.name}"${prices ? ` and its ${prices} price${prices === 1 ? "" : "s"}` : ""}` });
    res.json({ ok: true, message: "Tier deleted" });
  })
);

router.patch("/reorder", reorderHandler({ table: "pricing_tiers", entity: "pricing_tier", label: "ticket tiers" }));

module.exports = router;
