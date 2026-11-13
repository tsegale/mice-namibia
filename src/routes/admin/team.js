"use strict";

// Admin > Pages > Team: the "Meet Our CEO" block and the team carousel on
// the Team page. Same rule as speakers: a real person only goes live once
// they have agreed to it, and the "coming soon" slides stay until the first
// member is live (real members and placeholders are never mixed). The order
// is set by dragging (PATCH /admin/team/reorder).

const express = require("express");
const { db } = require("../../db/knex");
const media = require("../../repositories/media");
const { audit } = require("../../repositories/audit");
const settings = require("../../services/settings");
const { parse, ValidationError } = require("../../validation/common");
const { member: schema } = require("../../validation/team");
const { assertMedia, nextSortOrder } = require("../../services/content");
const { reorderHandler } = require("./reorder");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const photoOf = async (id) => (id ? (await media.byIds([id])).get(id) || null : null);
const isLive = (m) => m.status === "published" && m.consent_confirmed;

router.get(
  "/",
  wrap(async (req, res) => {
    const [rows, ceo] = await Promise.all([db()("team_members").orderBy("sort_order").orderBy("id").then((r) => media.attach(r, "photo_media_id", "photo")), settings.read("ceo")]);
    const id = Number(req.query.edit);
    const open = req.query.ceo ? "/admin/team/ceo/edit" : req.query.new ? "/admin/team/new" : id ? `/admin/team/${id}/edit` : null;
    res.render("admin/team/list", { title: "Team", rows, liveCount: rows.filter(isLive).length, ceo, ceoPhoto: await photoOf(ceo.photo_media_id), open });
  })
);

/* CEO ------------------------------------------------------------------------ */

router.get(
  "/ceo/edit",
  wrap(async (req, res) => {
    const ceo = await settings.read("ceo");
    res.render("admin/team/ceo", { c: ceo, photo: await photoOf(ceo.photo_media_id) });
  })
);

router.put(
  "/ceo",
  wrap(async (req, res) => {
    const input = req.body || {};
    // Checked before saving: publishing needs the two things the placeholder
    // card says are missing.
    if (input.status === "published") {
      const errors = {};
      if (!String(input.name || "").trim()) errors.name = "Add the CEO's name before publishing. Until then, save as a draft.";
      if (!input.photo_media_id) errors.photo_media_id = "Add the CEO's photo before publishing. Until then, save as a draft.";
      if (Object.keys(errors).length) throw new ValidationError(errors);
    }
    await assertMedia([Number(input.photo_media_id) || null], "photo_media_id");
    const { before, after } = await settings.save("ceo", input);
    if (before.photo_media_id !== after.photo_media_id) await media.releaseIfUnused([before.photo_media_id]);
    const changed = settings.changedFields(before, after);
    if (changed.length) await audit(req, { action: "update", entity: "settings", entityId: null, summary: `changed the CEO block (${changed.join(", ")})` });
    res.json({ ok: true, message: after.status === "published" ? "CEO block saved and live" : "CEO block saved as a draft (the placeholder stays on the site)" });
  })
);

/* Members -------------------------------------------------------------------- */

router.get("/new", wrap(async (req, res) => res.render("admin/team/form", { m: { status: "draft" }, photo: null })));

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const m = await db()("team_members").where({ id: req.params.id }).first();
    if (!m) return next();
    res.render("admin/team/form", { m, photo: await photoOf(m.photo_media_id) });
  })
);

async function save(req, existing) {
  const data = parse(schema, req.body);
  if (data.status === "published") {
    const errors = {};
    // Real people only go on the website once they have agreed to it.
    if (!data.consent_confirmed) errors.consent_confirmed = "Tick this once the team member has agreed to appear on the website. Until then, save as a draft.";
    if (!data.photo_media_id) errors.photo_media_id = "Add a photo before publishing. Until then, save as a draft.";
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }
  await assertMedia([data.photo_media_id], "photo_media_id");
  const row = {
    name: data.name,
    role: data.role,
    photo_media_id: data.photo_media_id,
    linkedin_url: data.linkedin_url,
    consent_confirmed: data.consent_confirmed,
    status: data.status,
  };
  let id = existing?.id;
  if (existing) {
    await db()("team_members").where({ id }).update(row);
    if (existing.photo_media_id !== row.photo_media_id) await media.releaseIfUnused([existing.photo_media_id]);
  } else {
    row.sort_order = await nextSortOrder(db(), "team_members");
    [id] = await db()("team_members").insert(row);
  }
  await audit(req, { action: existing ? "update" : "create", entity: "team_member", entityId: id, summary: `${existing ? "updated" : "added"} the team member "${row.name}"${isLive(row) ? "" : " (not live)"}` });
  return row;
}

router.post(
  "/",
  wrap(async (req, res) => {
    const row = await save(req, null);
    res.status(201).json({ ok: true, message: isLive(row) ? "Team member published" : "Team member saved as a draft" });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("team_members").where({ id: req.params.id }).first();
    if (!existing) return next();
    const row = await save(req, existing);
    res.json({ ok: true, message: isLive(row) ? "Team member saved and live" : "Team member saved as a draft" });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("team_members").where({ id: req.params.id }).first();
    if (!existing) return next();
    await db()("team_members").where({ id: existing.id }).delete();
    await media.releaseIfUnused([existing.photo_media_id]);
    await audit(req, { action: "delete", entity: "team_member", entityId: existing.id, summary: `deleted the team member "${existing.name}"` });
    res.json({ ok: true, message: "Team member deleted" });
  })
);

router.patch("/reorder", reorderHandler({ table: "team_members", entity: "team_member", label: "team members" }));

module.exports = router;
