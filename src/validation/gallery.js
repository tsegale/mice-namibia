"use strict";

const v = require("./common");

const item = v.z.object({
  media_id: v.id("Photo", { required: true }),
  // Required before publishing (checked on save); drafts may leave it empty.
  alt: v.optionalText(255, "Description"),
  caption: v.nullableText(255, "Caption"),
  category_id: v.id("Category"),
  show_on_home: v.bool,
  status: v.status,
});

const category = v.z.object({
  name: v.trimmed(80, "Category name"),
});

module.exports = { item, category };
