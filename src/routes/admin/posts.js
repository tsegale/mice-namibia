"use strict";

const express = require("express");
const { db } = require("../../db/knex");
const media = require("../../repositories/media");
const { audit } = require("../../repositories/audit");
const { parse, ValidationError } = require("../../validation/common");
const { post: schema } = require("../../validation/posts");
const { cleanBody, assertMedia } = require("../../services/content");
const { uniqueSlug } = require("../../services/slugs");
const { recordMove } = require("../../middleware/redirects");
const { readingMinutes, slugify } = require("../../lib/text");
const { zonedToUtc, localInputValue } = require("../../lib/dates");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
// Blog times are entered and shown in Namibian time.
const TZ = "Africa/Windhoek";

router.get(
  "/",
  wrap(async (req, res) => {
    const now = new Date();
    const filter = ["published", "scheduled", "draft"].includes(req.query.show) ? req.query.show : "all";
    let q = db()("posts as p").leftJoin("post_categories as pc", "pc.id", "p.category_id").select("p.*", "pc.name as category");
    if (filter === "published") q = q.where("p.status", "published").where("p.published_at", "<=", now);
    if (filter === "scheduled") q = q.where("p.status", "published").where("p.published_at", ">", now);
    if (filter === "draft") q = q.where("p.status", "draft");
    const rows = await media.attach(await q.orderByRaw("p.published_at IS NULL DESC").orderBy("p.published_at", "desc").orderBy("p.id", "desc"), "cover_media_id", "cover");
    const counts = await db()("posts")
      .select(
        db().raw("COUNT(*) AS all_count"),
        db().raw("SUM(status = 'published' AND published_at <= ?) AS published_count", [now]),
        db().raw("SUM(status = 'published' AND published_at > ?) AS scheduled_count", [now]),
        db().raw("SUM(status = 'draft') AS draft_count")
      )
      .first();
    const open = req.query.new ? "/admin/posts/new" : req.query.edit ? `/admin/posts/${Number(req.query.edit)}/edit` : null;
    res.render("admin/posts/list", { title: "Blog", rows, filter, counts, now, open });
  })
);

async function formData(row) {
  const categories = await db()("post_categories").orderBy("sort_order").orderBy("name");
  const cover = row?.cover_media_id ? (await media.byIds([row.cover_media_id])).get(row.cover_media_id) : null;
  return { categories, cover };
}

router.get(
  "/new",
  wrap(async (req, res) => {
    res.render("admin/posts/form", { p: { status: "draft", author_name: "Zusammen Travels MICE" }, publishedLocal: localInputValue(new Date(), TZ), ...(await formData(null)) });
  })
);

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const p = await db()("posts").where({ id: req.params.id }).first();
    if (!p) return next();
    res.render("admin/posts/form", { p, publishedLocal: localInputValue(p.published_at || new Date(), TZ), ...(await formData(p)) });
  })
);

async function save(req, existing) {
  const data = parse(schema, req.body);
  const body = cleanBody(data.body, "body", "Article");
  await assertMedia([data.cover_media_id], "cover_media_id");

  const releasable = [];
  const result = await db().transaction(async (trx) => {
    let categoryId = data.category_id;
    if (data.new_category) {
      const name = data.new_category;
      const found = await trx("post_categories").whereRaw("LOWER(name) = ?", [name.toLowerCase()]).first();
      if (found) categoryId = found.id;
      else {
        const max = await trx("post_categories").max({ n: "sort_order" }).first();
        [categoryId] = await trx("post_categories").insert({ name, slug: slugify(name), sort_order: Number(max?.n || 0) + 1 });
      }
    } else if (categoryId && !(await trx("post_categories").where({ id: categoryId }).first())) {
      throw new ValidationError({ category_id: "Choose a category." });
    }
    if (!categoryId) throw new ValidationError({ category_id: "Choose a category or add a new one." });

    let publishedAt = data.published_local ? zonedToUtc(data.published_local, TZ) : null;
    if (data.status === "published" && !publishedAt) publishedAt = new Date();

    // A position on the Services page belongs to one article at a time.
    if (data.services_position) {
      let clear = trx("posts").where({ services_position: data.services_position });
      if (existing) clear = clear.whereNot({ id: existing.id });
      await clear.update({ services_position: null });
    }

    const row = {
      title: data.title,
      category_id: categoryId,
      excerpt: data.excerpt,
      body,
      cover_media_id: data.cover_media_id,
      cover_alt: data.cover_alt,
      reading_minutes: readingMinutes(body),
      author_name: data.author_name,
      status: data.status,
      published_at: publishedAt,
      services_position: data.services_position,
      seo_title: data.seo_title,
      seo_description: data.seo_description,
      updated_by: req.session.user.id,
    };
    row.slug = await uniqueSlug("posts", data.slug || data.title, { excludeId: existing?.id, trx });
    let id = existing?.id;
    if (existing) {
      await trx("posts").where({ id }).update(row);
      if (existing.slug !== row.slug) await recordMove(trx, `/blog/${existing.slug}`, `/blog/${row.slug}`);
      releasable.push(existing.cover_media_id);
    } else {
      [id] = await trx("posts").insert({ ...row, created_by: req.session.user.id });
    }
    return { id, row };
  });
  await media.releaseIfUnused(releasable);
  await audit(req, { action: existing ? "update" : "create", entity: "post", entityId: result.id, summary: `${existing ? "updated" : "added"} the article "${result.row.title}"`.slice(0, 255) });
  return result;
}

function message(row) {
  if (row.status === "draft") return "Article saved as a draft";
  return row.published_at > new Date() ? "Article scheduled" : "Article published";
}

router.post(
  "/",
  wrap(async (req, res) => {
    const { row } = await save(req, null);
    res.status(201).json({ ok: true, message: message(row) });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("posts").where({ id: req.params.id }).first();
    if (!existing) return next();
    const { row } = await save(req, existing);
    res.json({ ok: true, message: message(row) });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("posts").where({ id: req.params.id }).first();
    if (!existing) return next();
    await db().transaction(async (trx) => {
      await trx("posts").where({ id: existing.id }).delete();
      if (existing.status === "published") await recordMove(trx, `/blog/${existing.slug}`, "/blog");
    });
    await media.releaseIfUnused([existing.cover_media_id]);
    await audit(req, { action: "delete", entity: "post", entityId: existing.id, summary: `deleted the article "${existing.title}"`.slice(0, 255) });
    res.json({ ok: true, message: "Article deleted" });
  })
);

module.exports = router;
