"use strict";

const v = require("./common");

const venue = v.z.object({
  name: v.trimmed(200, "Name"),
  full_name: v.optionalText(255, "Full name"),
  slug: v.slug,
  category_id: v.id("Venue category", { required: true }),
  tag_ids: v.idList,
  city: v.trimmed(120, "City"),
  country_iso2: v.z
    .unknown()
    .optional()
    .transform((s) => String(s || "").toLowerCase())
    .refine((s) => /^[a-z]{2}$/.test(s), "Choose a country."),
  description: v.trimmed(200000, "Description"),
  map_query: v.optionalText(255, "Map search"),
  card_media_id: v.id("Main photo", { required: true }),
  home_media_id: v.id("Homepage photo"),
  gallery: v.gallery(20),
  featured_on_home: v.bool,
  sort_order: v.int("Display order", { max: 999 }),
  status: v.status,
});

module.exports = { venue };
