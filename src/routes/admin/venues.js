"use strict";

const express = require("express");
const { db } = require("../../db/knex");
const media = require("../../repositories/media");
const { audit } = require("../../repositories/audit");
const { imageUrl } = require("../../lib/picture");
const { parse, ValidationError } = require("../../validation/common");
const { venue: schema } = require("../../validation/venues");
const { cleanBody, assertMedia, replaceImages } = require("../../services/content");
const { uniqueSlug } = require("../../services/slugs");
const { recordMove } = require("../../middleware/redirects");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get(
  "/",
  wrap(async (req, res) => {
    const filter = ["published", "draft"].includes(req.query.show) ? req.query.show : "all";
    let q = db()("venues as v")
      .join("countries as n", "n.iso2", "v.country_iso2")
      .leftJoin("venue_categories as vc", "vc.id", "v.category_id")
      .select("v.*", "n.name as country", "vc.name as category");
    if (filter !== "all") q = q.where("v.status", filter);
    const rows = await media.attach(await q.orderBy("v.sort_order").orderBy("v.name"), "card_media_id", "card");
    const imageCounts = Object.fromEntries((await db()("venue_images").select("venue_id").count({ n: "*" }).groupBy("venue_id")).map((r) => [r.venue_id, Number(r.n)]));
    const counts = await db()("venues").select(db().raw("COUNT(*) AS all_count"), db().raw("SUM(status = 'published') AS published_count"), db().raw("SUM(status = 'draft') AS draft_count")).first();
    const open = req.query.new ? "/admin/venues/new" : req.query.edit ? `/admin/venues/${Number(req.query.edit)}/edit` : null;
    res.render("admin/venues/list", { title: "Venues", rows, filter, counts, imageCounts, open });
  })
);

async function formData(row) {
  const [countries, categories, tags] = await Promise.all([db()("countries").orderBy("sort_order"), db()("venue_categories").orderBy("sort_order"), db()("venue_tags").orderBy("sort_order")]);
  let gallery = [];
  let tagIds = [];
  let card = null;
  let home = null;
  if (row?.id) {
    const imgs = await db()("venue_images").where({ venue_id: row.id }).orderBy("sort_order");
    const map = await media.byIds([...imgs.map((i) => i.media_id), row.card_media_id, row.home_media_id]);
    gallery = imgs.map((i) => ({ media_id: i.media_id, alt: i.alt, thumb: imageUrl(map.get(i.media_id), 640) }));
    card = map.get(row.card_media_id) || null;
    home = map.get(row.home_media_id) || null;
    tagIds = await db()("venue_tag").where({ venue_id: row.id }).pluck("tag_id");
  }
  return { countries, categories, tags, gallery, tagIds, card, home };
}

router.get(
  "/new",
  wrap(async (req, res) => {
    const next = await db()("venues").max({ n: "sort_order" }).first();
    res.render("admin/venues/form", { v: { status: "draft", country_iso2: "na", featured_on_home: true, sort_order: Number(next?.n || 0) + 1 }, ...(await formData(null)) });
  })
);

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const v = await db()("venues").where({ id: req.params.id }).first();
    if (!v) return next();
    res.render("admin/venues/form", { v, ...(await formData(v)) });
  })
);

async function save(req, existing) {
  const data = parse(schema, req.body);
  const [country, category] = await Promise.all([db()("countries").where({ iso2: data.country_iso2 }).first(), db()("venue_categories").where({ id: data.category_id }).first()]);
  const errors = {};
  if (!country) errors.country_iso2 = "Choose a country.";
  if (!category) errors.category_id = "Choose a venue category.";
  if (data.tag_ids.length && (await db()("venue_tags").whereIn("id", data.tag_ids).pluck("id")).length !== data.tag_ids.length) errors.tag_ids = "One of the product categories no longer exists.";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  await assertMedia([data.card_media_id], "card_media_id");
  await assertMedia([data.home_media_id], "home_media_id");
  await assertMedia(data.gallery.map((g) => g.media_id));

  const row = {
    name: data.name,
    full_name: data.full_name || data.name,
    category_id: data.category_id,
    city: data.city,
    country_iso2: data.country_iso2,
    description: cleanBody(data.description, "description", "Description"),
    map_query: data.map_query || `${data.full_name || data.name}, ${data.city}, ${country.name}`,
    card_media_id: data.card_media_id,
    home_media_id: data.home_media_id,
    featured_on_home: data.featured_on_home,
    sort_order: data.sort_order,
    status: data.status,
    updated_by: req.session.user.id,
  };

  const releasable = [];
  const id = await db().transaction(async (trx) => {
    row.slug = await uniqueSlug("venues", data.slug || data.name, { excludeId: existing?.id, trx });
    let venueId = existing?.id;
    if (existing) {
      await trx("venues").where({ id: existing.id }).update(row);
      if (existing.slug !== row.slug) await recordMove(trx, `/venues/${existing.slug}`, `/venues/${row.slug}`);
      releasable.push(existing.card_media_id, existing.home_media_id);
    } else {
      [venueId] = await trx("venues").insert({ ...row, created_by: req.session.user.id });
    }
    await trx("venue_tag").where({ venue_id: venueId }).delete();
    if (data.tag_ids.length) await trx("venue_tag").insert(data.tag_ids.map((tid) => ({ venue_id: venueId, tag_id: tid })));
    releasable.push(...(await replaceImages(trx, "venue_images", "venue_id", venueId, data.gallery)));
    return venueId;
  });
  await media.releaseIfUnused(releasable);
  await audit(req, { action: existing ? "update" : "create", entity: "venue", entityId: id, summary: `${existing ? "updated" : "added"} the venue "${row.name}"` });
  return { id, row };
}

router.post(
  "/",
  wrap(async (req, res) => {
    const { row } = await save(req, null);
    res.status(201).json({ ok: true, message: row.status === "published" ? "Venue published" : "Venue saved as a draft" });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("venues").where({ id: req.params.id }).first();
    if (!existing) return next();
    const { row } = await save(req, existing);
    res.json({ ok: true, message: row.status === "published" ? "Venue saved and live" : "Venue saved as a draft" });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("venues").where({ id: req.params.id }).first();
    if (!existing) return next();
    const images = await db()("venue_images").where({ venue_id: existing.id }).pluck("media_id");
    await db().transaction(async (trx) => {
      await trx("venues").where({ id: existing.id }).delete();
      if (existing.status === "published") await recordMove(trx, `/venues/${existing.slug}`, "/venues");
    });
    await media.releaseIfUnused([existing.card_media_id, existing.home_media_id, ...images]);
    await audit(req, { action: "delete", entity: "venue", entityId: existing.id, summary: `deleted the venue "${existing.name}"` });
    res.json({ ok: true, message: "Venue deleted" });
  })
);

module.exports = router;
