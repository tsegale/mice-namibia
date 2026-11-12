"use strict";

// Admin > Gallery. Photos are added in bulk (one request per file, each
// becoming a draft), then described and published one by one: a photo
// cannot be published without its description (alt text). The order is
// set by dragging (PATCH .../reorder); categories are the filter chips.

const express = require("express");
const multer = require("multer");
const config = require("../../config");
const { db } = require("../../db/knex");
const media = require("../../repositories/media");
const { audit } = require("../../repositories/audit");
const { processImage, UploadError } = require("../../lib/images");
const { parse, ValidationError } = require("../../validation/common");
const { item: itemSchema, category: categorySchema } = require("../../validation/gallery");
const { assertMedia, nextSortOrder } = require("../../services/content");
const { uniqueSlug } = require("../../services/slugs");
const { reorderHandler } = require("./reorder");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploads.maxBytes, files: 1, fields: 5 } });

const NEEDS_ALT = "Add a description of the photo before publishing it. It is read out to people using screen readers and helps the photo show up in search. Until then, save it as a draft.";

const categoryList = () => db()("gallery_categories").orderBy("sort_order").orderBy("id");

router.get(
  "/",
  wrap(async (req, res) => {
    const [rows, categories] = await Promise.all([
      db()("gallery_items").orderBy("sort_order").orderBy("id").then((r) => media.attach(r, "media_id", "media")),
      categoryList(),
    ]);
    const categoryName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    for (const c of categories) c.count = rows.filter((r) => r.category_id === c.id).length;
    const open = req.query.edit ? `/admin/gallery/${Number(req.query.edit)}/edit` : null;
    res.render("admin/gallery/list", {
      title: "Gallery",
      rows,
      categories,
      categoryName,
      needAlt: rows.filter((r) => !r.alt).length,
      onHome: rows.filter((r) => r.status === "published" && r.show_on_home).length,
      open,
    });
  })
);

/* Bulk upload: one photo per request, each becomes a draft at the end. ------- */

router.post("/upload", (req, res, next) => {
  upload.single("file")(req, res, async (err) => {
    try {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") throw new UploadError(`Images must be smaller than ${Math.round(config.uploads.maxBytes / 1024 / 1024)} MB.`, 413);
        throw err;
      }
      if (!req.file) throw new UploadError("Choose a photo to upload.");
      const row = await processImage(req.file.buffer, req.file.originalname);
      const saved = await media.insert(row, req.session.user.id);
      const [id] = await db()("gallery_items").insert({ media_id: saved.id, alt: "", status: "draft", sort_order: await nextSortOrder(db(), "gallery_items") });
      await audit(req, { action: "create", entity: "gallery_item", entityId: id, summary: `uploaded ${req.file.originalname} to the gallery`.slice(0, 255) });
      res.status(201).json({ ok: true, item: { id, media: media.forClient(saved) } });
    } catch (e) {
      next(e);
    }
  });
});

/* Photos ------------------------------------------------------------------------ */

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const g = await db()("gallery_items").where({ id: req.params.id }).first();
    if (!g) return next();
    const photo = (await media.byIds([g.media_id])).get(g.media_id) || null;
    res.render("admin/gallery/form", { g, photo, categories: await categoryList() });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("gallery_items").where({ id: req.params.id }).first();
    if (!existing) return next();
    const data = parse(itemSchema, req.body);
    if (data.status === "published" && !data.alt) throw new ValidationError({ alt: NEEDS_ALT }, "This photo needs a description before it can be published.");
    await assertMedia([data.media_id], "media_id");
    if (data.category_id && !(await db()("gallery_categories").where({ id: data.category_id }).first())) {
      throw new ValidationError({ category_id: "Choose a category from the list." });
    }
    const row = { media_id: data.media_id, alt: data.alt, caption: data.caption, category_id: data.category_id, show_on_home: data.show_on_home, status: data.status };
    await db()("gallery_items").where({ id: existing.id }).update(row);
    if (existing.media_id !== row.media_id) await media.releaseIfUnused([existing.media_id]);
    await audit(req, { action: "update", entity: "gallery_item", entityId: existing.id, summary: `updated the gallery photo "${(row.alt || "no description").slice(0, 120)}"` });
    res.json({ ok: true, message: row.status === "published" ? "Photo saved and live" : "Photo saved as a draft" });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const existing = await db()("gallery_items").where({ id: req.params.id }).first();
    if (!existing) return next();
    await db()("gallery_items").where({ id: existing.id }).delete();
    await media.releaseIfUnused([existing.media_id]);
    await audit(req, { action: "delete", entity: "gallery_item", entityId: existing.id, summary: `deleted the gallery photo "${(existing.alt || "no description").slice(0, 120)}"` });
    res.json({ ok: true, message: "Photo deleted" });
  })
);

router.patch("/reorder", reorderHandler({ table: "gallery_items", entity: "gallery_item", label: "gallery photos" }));

/* Categories (the filter chips) ------------------------------------------------- */

router.patch("/categories/reorder", reorderHandler({ table: "gallery_categories", entity: "gallery_category", label: "gallery categories" }));

router.get("/categories/new", (req, res) => res.render("admin/gallery/category-form", { c: {}, photoCount: 0 }));

router.get(
  "/categories/:id/edit",
  wrap(async (req, res, next) => {
    const c = await db()("gallery_categories").where({ id: req.params.id }).first();
    if (!c) return next();
    const [{ n }] = await db()("gallery_items").where({ category_id: c.id }).count({ n: "*" });
    res.render("admin/gallery/category-form", { c, photoCount: Number(n) });
  })
);

router.post(
  "/categories",
  wrap(async (req, res) => {
    const { name } = parse(categorySchema, req.body);
    // The slug is the filter value on the Gallery page; set once, so a
    // rename never breaks a filter link.
    const slug = await uniqueSlug("gallery_categories", name);
    const [id] = await db()("gallery_categories").insert({ name, slug, sort_order: await nextSortOrder(db(), "gallery_categories") });
    await audit(req, { action: "create", entity: "gallery_category", entityId: id, summary: `added the gallery category "${name}"` });
    res.status(201).json({ ok: true, message: "Category added" });
  })
);

router.put(
  "/categories/:id",
  wrap(async (req, res, next) => {
    const c = await db()("gallery_categories").where({ id: req.params.id }).first();
    if (!c) return next();
    const { name } = parse(categorySchema, req.body);
    await db()("gallery_categories").where({ id: c.id }).update({ name });
    await audit(req, { action: "update", entity: "gallery_category", entityId: c.id, summary: `renamed the gallery category "${c.name}" to "${name}"` });
    res.json({ ok: true, message: "Category saved" });
  })
);

router.delete(
  "/categories/:id",
  wrap(async (req, res, next) => {
    const c = await db()("gallery_categories").where({ id: req.params.id }).first();
    if (!c) return next();
    // Its photos stay in the gallery, without a category.
    await db()("gallery_categories").where({ id: c.id }).delete();
    await audit(req, { action: "delete", entity: "gallery_category", entityId: c.id, summary: `deleted the gallery category "${c.name}"` });
    res.json({ ok: true, message: "Category deleted" });
  })
);

module.exports = router;
