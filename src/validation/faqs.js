"use strict";

const v = require("./common");

// "" (no country) or a two-letter code; the code is checked against the
// countries table on save.
const iso2 = v.z
  .unknown()
  .optional()
  .transform((s) => String(s ?? "").trim().toLowerCase() || null)
  .refine((s) => s === null || /^[a-z]{2}$/.test(s), "Choose a country from the list.");

const faq = v.z.object({
  group_id: v.id("Group", { required: true }),
  question: v.trimmed(255, "Question"),
  // Cleaned and checked for emptiness on save (services/content cleanShort).
  answer: v.optionalText(20000, "Answer"),
  country_iso2: iso2,
  show_on_home: v.bool,
  status: v.status,
});

const group = v.z.object({
  name: v.trimmed(120, "Group name"),
});

module.exports = { faq, group, iso2 };
