"use strict";

const v = require("./common");
const { zonedToUtc } = require("../lib/dates");

const localDateTime = (label) =>
  v.z
    .unknown()
    .optional()
    .transform((s) => String(s || "").trim())
    .refine((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s), `${label} is required.`);

const conference = v.z
  .object({
    title: v.trimmed(255, "Full title"),
    short_title: v.trimmed(120, "Short title"),
    slug: v.slug,
    country_iso2: v.z
      .unknown()
      .optional()
      .transform((s) => String(s || "").toLowerCase())
      .refine((s) => /^[a-z]{2}$/.test(s), "Choose a country."),
    city: v.trimmed(120, "City"),
    starts_local: localDateTime("Start date and time"),
    ends_local: localDateTime("End date and time"),
    organiser: v.optionalText(200, "Organiser"),
    excerpt: v.trimmed(400, "Summary"),
    body: v.trimmed(200000, "Description"),
    pull_quote: v.nullableText(1000, "Highlight quote"),
    cover_media_id: v.id("Cover photo", { required: true }),
    cover_alt: v.optionalText(255, "Cover photo description"),
    gallery: v.gallery(12),
    images_are_stand_ins: v.bool,
    registration_url: v.url("Registration link"),
    speaker_ids: v.idList,
    status: v.status,
  })
  .superRefine((d, ctx) => {
    if (d.starts_local && d.ends_local && d.ends_local <= d.starts_local) {
      ctx.addIssue({ code: "custom", path: ["ends_local"], message: "The end must be after the start." });
    }
  });

// Turns the form's local times into UTC using the country's timezone.
function toRow(data, timezone) {
  return {
    title: data.title,
    short_title: data.short_title,
    country_iso2: data.country_iso2,
    city: data.city,
    timezone,
    starts_at: zonedToUtc(data.starts_local, timezone),
    ends_at: zonedToUtc(data.ends_local, timezone),
    organiser: data.organiser,
    excerpt: data.excerpt,
    pull_quote: data.pull_quote,
    cover_media_id: data.cover_media_id,
    cover_alt: data.cover_alt,
    images_are_stand_ins: data.images_are_stand_ins,
    registration_url: data.registration_url,
    status: data.status,
  };
}

module.exports = { conference, toRow };
