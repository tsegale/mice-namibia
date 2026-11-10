"use strict";

const { z } = require("zod");

// Form values arrive as strings; these helpers turn them into clean values
// and give every rule a message written for Macedo, not for a developer.

// Every helper accepts a missing key (the form may not send it) and
// normalises the raw form value before validating it.
const raw = () => z.unknown().optional();
const str = (v) => (v == null ? "" : String(v).trim());

const trimmed = (max, label) =>
  raw()
    .transform(str)
    .pipe(z.string().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`));

const optionalText = (max, label) =>
  raw()
    .transform(str)
    .pipe(z.string().max(max, `${label} must be ${max} characters or fewer.`));

const nullableText = (max, label) => optionalText(max, label).transform((s) => s || null);

const slug = raw()
  .transform((v) => str(v).toLowerCase())
  .pipe(z.string().max(120, "The web address must be 120 characters or fewer.").regex(/^[a-z0-9-]*$/, "Use only lowercase letters, numbers and hyphens in the web address."));

const url = (label) =>
  raw()
    .transform(str)
    .pipe(z.union([z.literal(""), z.url({ protocol: /^https?$/, error: `${label} must be a full web address starting with https://` }).max(255)], { error: `${label} must be a full web address starting with https://` }))
    .transform((s) => s || null);

const id = (label, { required = false } = {}) =>
  raw()
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0), `Choose a valid ${label.toLowerCase()}.`)
    .refine((v) => !required || v !== null, `${label} is required.`);

const bool = raw().transform((v) => v === true || v === "true" || v === "on" || v === "1" || v === 1);

const status = raw().pipe(z.enum(["draft", "published"], { error: "Choose Draft or Published." }));

const idList = raw().transform((a) => [...new Set((Array.isArray(a) ? a : a == null || a === "" ? [] : [a]).map(Number).filter((n) => Number.isInteger(n) && n > 0))]);

const gallery = (max) =>
  raw()
    .transform((a) => (Array.isArray(a) ? a : []))
    .pipe(z.array(z.object({ media_id: z.coerce.number().int().positive(), alt: z.unknown().optional().transform(str).pipe(z.string().max(255, "Photo descriptions must be 255 characters or fewer.")) })).max(max, `Add at most ${max} photos.`));

const int = (label, { min = 0, max = 9999 } = {}) =>
  raw()
    .transform((v) => (v === "" || v == null ? 0 : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= min && v <= max, `${label} must be a whole number between ${min} and ${max}.`);

class ValidationError extends Error {
  constructor(fieldErrors, message = "Please fix the highlighted fields.") {
    super(message);
    this.status = 422;
    this.expose = true;
    this.fieldErrors = fieldErrors;
  }
}

// Runs a schema and throws one error carrying a message per field.
function parse(schema, body) {
  const result = schema.safeParse(body || {});
  if (result.success) return result.data;
  const fieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  throw new ValidationError(fieldErrors);
}

module.exports = { z, trimmed, optionalText, nullableText, slug, url, id, bool, status, idList, gallery, int, parse, ValidationError };
