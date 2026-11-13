"use strict";

const v = require("./common");
const { parseAmount, CURRENCIES } = require("../lib/money");

// One feature per line in the form; an ordered list in the database.
const features = v.z
  .unknown()
  .optional()
  .transform((x) => (Array.isArray(x) ? x : String(x ?? "").split(/\r?\n/)).map((f) => String(f).trim()).filter(Boolean))
  .pipe(v.z.array(v.z.string().max(120, "Keep each feature under 120 characters.")).max(12, "List at most 12 features."));

const tier = v.z.object({
  name: v.trimmed(80, "Name"),
  tagline: v.optionalText(255, "Tagline"),
  features,
  highlighted: v.bool,
  status: v.status,
});

// One row of the conference panel's price table.
const price = v.z.object({
  amount: v.z
    .unknown()
    .optional()
    .transform(parseAmount)
    .refine((c) => !Number.isNaN(c), "Enter the price as a number, e.g. 1250 or 1250.50."),
  currency: v.z
    .unknown()
    .optional()
    .transform((c) => String(c || "NAD").toUpperCase())
    .pipe(v.z.enum(CURRENCIES, { error: "Choose a currency from the list." })),
});

module.exports = { tier, price };
