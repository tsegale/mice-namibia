"use strict";

const express = require("express");
const { db } = require("../../db/knex");
const media = require("../../repositories/media");
const { audit } = require("../../repositories/audit");
const { parse, ValidationError } = require("../../validation/common");
const { speaker: schema } = require("../../validation/speakers");
const { assertMedia } = require("../../services/content");
const { uniqueSlug } = require("../../services/slugs");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get(
  "/",
  wrap(async (req, res) => {
    const rows = await media.attach(await db()("speakers").orderBy("is_sample").orderBy("sort_order").orderBy("name"), "photo_media_id", "photo");
    const events = await db()("conference_speakers as cs").join("conferences as c", "c.id", "cs.conference_id").select("cs.speaker_id", "c.short_title");
    const eventsBySpeaker = {};
    for (const e of events) (eventsBySpeaker[e.speaker_id] = eventsBySpeaker[e.speaker_id] || []).push(e.short_title);
    const realCount = rows.filter((s) => !s.is_sample && s.status === "published" && s.consent_confirmed).length;
    const open = req.query.new ? "/admin/speakers/new" : req.query.edit ? `/admin/speakers/${Number(req.query.edit)}/edit` : null;
    res.render("admin/speakers/list", { title: "Speakers", rows, eventsBySpeaker, realCount, open });
  })
);

async function photoOf(row) {
  return row?.photo_media_id ? (await media.byIds([row.photo_media_id])).get(row.photo_media_id) : null;
}

router.get(
  "/new",
  wrap(async (req, res) => {
    res.render("admin/speakers/form", { s: { status: "draft", show_on_home: true, sort_order: 0 }, photo: null });
  })
);

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const s = await db()("speakers").where({ id: req.params.id }).first();
    if (!s) return next();
    res.render("admin/speakers/form", { s, photo: await photoOf(s) });
  })
);

async function save(req, existing) {
  const data = parse(schema, req.body);
  const isSample = Boolean(existing?.is_sample);
  // Real people only go on the website once they have agreed to it.
  if (!isSample && data.status === "published" && !data.consent_confirmed) {
    throw new ValidationError({ consent_confirmed: "Tick this once the speaker has agreed to appear on the website. Until then, save as a draft." });
  }
  await assertMedia([data.photo_media_id], "photo_media_id");
  const row = {
    name: data.name,
    role: data.role,
    organisation: data.organisation,
    bio: data.bio,
    photo_media_id: data.photo_media_id,
    linkedin_url: data.linkedin_url,
    website_url: data.website_url,
    consent_confirmed: isSample ? false : data.consent_confirmed,
    show_on_home: data.show_on_home,
    sort_order: data.sort_order,
    status: data.status,
  };
  let id = existing?.id;
  if (existing) {
    await db()("speakers").where({ id }).update(row);
    if (existing.photo_media_id !== row.photo_media_id) await media.releaseIfUnused([existing.photo_media_id]);
  } else {
    row.slug = await uniqueSlug("speakers", data.name);
    [id] = await db()("speakers").insert(row);
  }
  await audit(req, { action: existing ? "update" : "create", entity: "speaker", entityId: id, summary: `${existing ? "updated" : "added"} the speaker "${row.name}"` });
  return row;
}

router.post(
  "/",
  wrap(async (req, res) => {
    const row = await save(req, null);
    res.status(201).json({ ok: true, message: row.status === "published" ? "Speaker published" : "Speaker saved as a draft" });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("speakers").where({ id: req.params.id }).first();
    if (!existing) return next();
    const row = await save(req, existing);
    res.json({ ok: true, message: row.status === "published" ? "Speaker saved and live" : "Speaker saved as a draft" });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("speakers").where({ id: req.params.id }).first();
    if (!existing) return next();
    await db()("speakers").where({ id: existing.id }).delete();
    await media.releaseIfUnused([existing.photo_media_id]);
    await audit(req, { action: "delete", entity: "speaker", entityId: existing.id, summary: `deleted the speaker "${existing.name}"` });
    res.json({ ok: true, message: "Speaker deleted" });
  })
);

module.exports = router;
