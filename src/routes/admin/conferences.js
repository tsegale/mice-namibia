"use strict";

const express = require("express");
const { db } = require("../../db/knex");
const media = require("../../repositories/media");
const { audit } = require("../../repositories/audit");
const { imageUrl } = require("../../lib/picture");
const { localInputValue } = require("../../lib/dates");
const { parse, ValidationError } = require("../../validation/common");
const { conference: schema, toRow } = require("../../validation/conferences");
const { cleanBody, assertMedia, replaceImages } = require("../../services/content");
const { uniqueSlug } = require("../../services/slugs");
const { recordMove } = require("../../middleware/redirects");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const FILTERS = {
  upcoming: (q) => q.where("c.ends_at", ">=", new Date()),
  past: (q) => q.where("c.ends_at", "<", new Date()),
  draft: (q) => q.where("c.status", "draft"),
};

/* List ------------------------------------------------------------------------ */

router.get(
  "/",
  wrap(async (req, res) => {
    const filter = FILTERS[req.query.show] ? req.query.show : "all";
    let q = db()("conferences as c").join("countries as n", "n.iso2", "c.country_iso2").select("c.*", "n.name as country");
    if (filter !== "all") q = FILTERS[filter](q);
    const rows = await media.attach(await q.orderBy("c.starts_at", filter === "past" ? "desc" : "asc"), "cover_media_id", "cover");
    const counts = await db()("conferences")
      .select(
        db().raw("COUNT(*) AS all_count"),
        db().raw("SUM(ends_at >= ?) AS upcoming_count", [new Date()]),
        db().raw("SUM(ends_at < ?) AS past_count", [new Date()]),
        db().raw("SUM(status = 'draft') AS draft_count")
      )
      .first();
    const open = req.query.new ? "/admin/conferences/new" : req.query.edit ? `/admin/conferences/${Number(req.query.edit)}/edit` : null;
    res.render("admin/conferences/list", { title: "Events", rows, filter, counts, open });
  })
);

/* Form fragments ---------------------------------------------------------------- */

async function formData(row) {
  const [countries, speakers] = await Promise.all([
    db()("countries").where((q) => q.where({ is_destination: true }).orWhere({ iso2: row?.country_iso2 || "" })).orderBy("sort_order"),
    db()("speakers").where({ is_sample: false }).orderBy("name").select("id", "name", "role", "status", "consent_confirmed"),
  ]);
  let gallery = [];
  let speakerIds = [];
  let cover = null;
  if (row?.id) {
    const imgs = await db()("conference_images").where({ conference_id: row.id }).orderBy("sort_order");
    const map = await media.byIds([...imgs.map((i) => i.media_id), row.cover_media_id]);
    gallery = imgs.map((i) => ({ media_id: i.media_id, alt: i.alt, thumb: imageUrl(map.get(i.media_id), 640) }));
    cover = map.get(row.cover_media_id) || null;
    speakerIds = await db()("conference_speakers").where({ conference_id: row.id }).orderBy("sort_order").pluck("speaker_id");
  }
  return { countries, speakers, gallery, speakerIds, cover };
}

router.get(
  "/new",
  wrap(async (req, res) => {
    res.render("admin/conferences/form", { c: { status: "draft", country_iso2: "na" }, starts: "", ends: "", ...(await formData(null)) });
  })
);

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const c = await db()("conferences").where({ id: req.params.id }).first();
    if (!c) return next();
    res.render("admin/conferences/form", {
      c,
      starts: localInputValue(c.starts_at, c.timezone),
      ends: localInputValue(c.ends_at, c.timezone),
      ...(await formData(c)),
    });
  })
);

/* Save --------------------------------------------------------------------------- */

async function save(req, existing) {
  const data = parse(schema, req.body);
  const country = await db()("countries").where({ iso2: data.country_iso2 }).first();
  if (!country || (!country.is_destination && country.iso2 !== existing?.country_iso2)) throw new ValidationError({ country_iso2: "Choose a country." });
  const row = toRow(data, country.timezone);
  row.body = cleanBody(data.body, "body", "Description");
  await assertMedia([data.cover_media_id], "cover_media_id");
  await assertMedia(data.gallery.map((g) => g.media_id));
  if (data.speaker_ids.length) {
    const found = await db()("speakers").whereIn("id", data.speaker_ids).pluck("id");
    if (found.length !== data.speaker_ids.length) throw new ValidationError({ speaker_ids: "One of the chosen speakers no longer exists." });
  }

  let releasable = [];
  const id = await db().transaction(async (trx) => {
    row.slug = await uniqueSlug("conferences", data.slug || data.short_title, { excludeId: existing?.id, trx });
    row.updated_by = req.session.user.id;
    let confId = existing?.id;
    if (existing) {
      await trx("conferences").where({ id: existing.id }).update(row);
      if (existing.slug !== row.slug) await recordMove(trx, `/events/${existing.slug}`, `/events/${row.slug}`);
      if (existing.cover_media_id !== row.cover_media_id) releasable.push(existing.cover_media_id);
    } else {
      [confId] = await trx("conferences").insert({ ...row, created_by: req.session.user.id });
    }
    releasable.push(...(await replaceImages(trx, "conference_images", "conference_id", confId, data.gallery)));
    await trx("conference_speakers").where({ conference_id: confId }).delete();
    if (data.speaker_ids.length) await trx("conference_speakers").insert(data.speaker_ids.map((sid, i) => ({ conference_id: confId, speaker_id: sid, sort_order: i })));
    return confId;
  });
  await media.releaseIfUnused(releasable);
  await audit(req, { action: existing ? "update" : "create", entity: "conference", entityId: id, summary: `${existing ? "updated" : "added"} the event "${row.short_title}"` });
  return { id, row };
}

router.post(
  "/",
  wrap(async (req, res) => {
    const { row } = await save(req, null);
    res.status(201).json({ ok: true, message: row.status === "published" ? "Event published" : "Event saved as a draft" });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("conferences").where({ id: req.params.id }).first();
    if (!existing) return next();
    const { row } = await save(req, existing);
    res.json({ ok: true, message: row.status === "published" ? "Event saved and live" : "Event saved as a draft" });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("conferences").where({ id: req.params.id }).first();
    if (!existing) return next();
    const images = await db()("conference_images").where({ conference_id: existing.id }).pluck("media_id");
    await db().transaction(async (trx) => {
      await trx("conferences").where({ id: existing.id }).delete();
      // Links already shared keep working: they land on the Events page.
      if (existing.status === "published") await recordMove(trx, `/events/${existing.slug}`, "/events");
    });
    await media.releaseIfUnused([existing.cover_media_id, ...images]);
    await audit(req, { action: "delete", entity: "conference", entityId: existing.id, summary: `deleted the event "${existing.short_title}"` });
    res.json({ ok: true, message: "Event deleted" });
  })
);

module.exports = router;
