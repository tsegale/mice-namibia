"use strict";

const v = require("./common");

const post = v.z.object({
  title: v.trimmed(200, "Title"),
  slug: v.slug,
  category_id: v.id("Category"),
  new_category: v.optionalText(80, "New category"),
  excerpt: v.trimmed(400, "Introduction"),
  body: v.trimmed(500000, "Article"),
  cover_media_id: v.id("Cover photo", { required: true }),
  cover_alt: v.optionalText(255, "Cover photo description"),
  author_name: v.trimmed(120, "Author"),
  status: v.status,
  published_local: v.z
    .unknown()
    .optional()
    .transform((s) => String(s || "").trim())
    .refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s), "Enter a valid date and time."),
  services_position: v.z
    .unknown()
    .optional()
    .transform((s) => (s === "" || s == null ? null : Number(s)))
    .refine((n) => n === null || [1, 2, 3].includes(n), "Choose a position on the Services page."),
  seo_title: v.nullableText(200, "Search title"),
  seo_description: v.nullableText(300, "Search description"),
});

module.exports = { post };
