"use strict";

// Typed site settings (Admin > Settings), stored in the settings table as
// one JSON row per group ("settings.contact", ...). Every group has a zod
// schema and defaults equal to what the site showed before settings existed,
// so an empty table renders the site exactly as before.
//
// Reads are cached in memory. A save clears this process's cache at once;
// the cache also expires after CACHE_MS, so other processes (Passenger can
// run several) pick the change up within a minute.

const { db } = require("../db/knex");
const logger = require("../lib/logger");
const v = require("../validation/common");
const { numberWord } = require("../lib/view-helpers");

const { z } = v;
const CACHE_MS = 60 * 1000;
const str = (x) => (x == null ? "" : String(x).trim());

const text = (max, label, { required = false } = {}) => (required ? v.trimmed(max, label) : v.optionalText(max, label));
const url = (label) =>
  z
    .unknown()
    .optional()
    .transform(str)
    .pipe(z.union([z.literal(""), z.url({ protocol: /^https$/, error: `${label} must be a full address starting with https://` }).max(255)], { error: `${label} must be a full address starting with https://` }));
const emailList = z
  .unknown()
  .optional()
  .transform((x) => [...new Set(str(x).split(/[\s,;]+/).map((e) => e.toLowerCase()).filter(Boolean))])
  .pipe(z.array(z.email("One of the addresses is not a valid email address.")).max(10, "Use at most 10 addresses."))
  .transform((list) => list.join(", "));

// Fixed pages whose title and description are edited under SEO (every page
// with an address; the noindex ones keep theirs in routes/page-meta.js).
const META = require("../routes/page-meta");
const SEO_PAGES = Object.keys(META).filter((k) => META[k].path);
const PAGE_LABELS = {
  home: "Homepage", about: "About Us", services: "Services", gallery: "Gallery", faq: "FAQ", partners: "Our Partners", pricing: "Pricing",
  contact: "Contact Us", team: "Meet the Team", "privacy-policy": "Privacy Policy", "terms-and-conditions": "Terms and Conditions",
  events: "Events", blog: "Blog", venues: "Venues",
};

// The titles and descriptions the reviewed site shipped with. Titles leave
// out the " | MICE Namibia" ending, which is added from the site name (a
// title that already names the site, like the homepage's, is kept as it is);
// "{destinations}" prints the live count as a word ("nine").
const DEFAULT_PAGES = {
  home: { title: "MICE Namibia | Meetings, Incentives, Conferences & Exhibitions", description: "MICE Namibia delivers end-to-end meetings, incentives, conferences and exhibitions management across {destinations} African destinations." },
  about: { title: "About Us", description: "Zusammen Travels brings the world closer through a global digital experience that inspires exploration, connection, and discovery." },
  services: { title: "Services", description: "Integrated event and destination management services for meetings, incentives, conferences, exhibitions and corporate travel across Africa." },
  gallery: { title: "Gallery", description: "Photos of the venues, events and experiences we work with across our African destinations." },
  faq: { title: "FAQ", description: "Answers to common questions about planning meetings, incentives, conferences and exhibitions across {destinations} African destinations." },
  partners: { title: "Our Partners", description: "Zusammen Travels proudly collaborates with valued partners who champion innovation, growth, and the creation of exceptional event experiences." },
  pricing: { title: "Pricing", description: "Ticket plans for our upcoming conferences in Africa: Early Bird, Standard and VIP, with prices on request." },
  contact: { title: "Contact Us", description: "Get in touch with MICE Namibia to plan your next meeting, incentive trip, conference or exhibition." },
  team: { title: "Meet Our Team", description: "Meet the CEO, team and speakers behind MICE Namibia." },
  "privacy-policy": { title: "Privacy Policy", description: "Privacy Policy for MICE Namibia." },
  "terms-and-conditions": { title: "Terms and Conditions", description: "Terms and Conditions for MICE Namibia." },
  events: { title: "Events", description: "Upcoming conferences across Africa with MICE Namibia: dates, venues, calendar files and registration of interest." },
  blog: { title: "Insights & Resources", description: "Explore expert insights, industry trends, practical guides, and innovative ideas from MICE Namibia." },
  venues: { title: "Venues", description: "Explore conference centres, hotels and resorts across Namibia and South Africa suited to meetings, incentives, conferences and exhibitions." },
};
if (SEO_PAGES.some((k) => !DEFAULT_PAGES[k])) throw new Error("Every fixed page in routes/page-meta.js needs a default title in services/settings.js");

const pageSchema = z.object({
  title: text(120, "Title", { required: true }),
  description: text(300, "Description"),
});

const GROUPS = {
  contact: {
    defaults: { phone: "+264 81 245 5852", email: "corporate.events@zusammentravels.com", address: "Windhoek, Namibia", map_query: "Windhoek,Namibia" },
    schema: z.object({
      phone: v.trimmed(40, "Phone").pipe(z.string().regex(/^\+?[0-9 ()./-]+$/, "Use only numbers, spaces and + ( ) - in the phone number.")),
      email: z.unknown().optional().transform((x) => str(x).toLowerCase()).pipe(z.email("Enter a valid email address.")),
      address: text(160, "Office address", { required: true }),
      map_query: text(160, "Map search", { required: true }),
    }),
  },
  social: {
    defaults: {
      facebook: "https://www.facebook.com/zusammentours",
      instagram: "https://www.instagram.com/zusammentours",
      youtube: "https://www.youtube.com/@ZusammenTravels-i1j",
      x: "https://x.com/TravelsZusammen",
      linkedin: "https://www.linkedin.com/company/zusammen-tours-and-travel-agency/",
      tripadvisor: "https://www.tripadvisor.co.za/Attraction_Review-g293821-d27952450-Reviews-Zusammen_Tours_and_Travel_Agency-Windhoek_Khomas_Region.html",
    },
    schema: z.object({ facebook: url("Facebook"), instagram: url("Instagram"), youtube: url("YouTube"), x: url("X"), linkedin: url("LinkedIn"), tripadvisor: url("TripAdvisor") }),
  },
  footer: {
    defaults: {
      company_line: "End-to-end meetings, incentives, conferences and exhibitions management across {destinations} African destinations.",
      copyright_holder: "Zusammen Tours and Travel Agency (MICE Department)",
    },
    schema: z.object({ company_line: text(300, "Company line", { required: true }), copyright_holder: text(160, "Copyright holder", { required: true }) }),
  },
  enquiries: {
    // Empty: notifications go to MAIL_TO from the server settings (.env).
    defaults: { notify_to: "" },
    schema: z.object({ notify_to: emailList }),
  },
  seo: {
    defaults: { site_name: "MICE Namibia", default_image_media_id: null, pages: DEFAULT_PAGES },
    schema: z.object({
      site_name: text(60, "Site name", { required: true }),
      default_image_media_id: v.id("Default share image"),
      pages: z.object(Object.fromEntries(SEO_PAGES.map((k) => [k, pageSchema]))),
    }),
  },
};

const cache = new Map();
const keyOf = (group) => `settings.${group}`;

function merge(group, stored) {
  const { defaults } = GROUPS[group];
  if (group !== "seo") return { ...defaults, ...stored };
  const pages = Object.fromEntries(SEO_PAGES.map((k) => [k, { ...defaults.pages[k], ...(stored?.pages?.[k] || {}) }]));
  return { ...defaults, ...stored, pages };
}

// One group straight from the table (no cache), merged with the defaults.
async function read(group) {
  const row = await db()("settings").where({ key: keyOf(group) }).first();
  return merge(group, row ? JSON.parse(row.value) : {});
}

async function get(group) {
  if (!GROUPS[group]) throw new Error(`Unknown settings group "${group}"`);
  const hit = cache.get(group);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value;
  try {
    value = await read(group);
  } catch (err) {
    // The site must still render (error pages use these too): fall back to
    // the defaults, and say so in the log.
    logger.error({ err: { message: err.message } }, `settings group "${group}" could not be read; using defaults`);
    return merge(group, {});
  }
  cache.set(group, { value, at: Date.now() });
  return value;
}

async function all() {
  const entries = await Promise.all(Object.keys(GROUPS).map(async (g) => [g, await get(g)]));
  return Object.fromEntries(entries);
}

// Like validation/common's parse, but an error on a nested field is reported
// under its full dotted name ("pages.faq.title"), which is also the name of
// its form field.
function parseGroup(group, input) {
  const result = GROUPS[group].schema.safeParse(input ?? {});
  if (result.success) return result.data;
  const fieldErrors = {};
  for (const issue of result.error.issues) {
    // Array positions are not part of a field name (one textarea holds the
    // whole list of addresses).
    const named = issue.path.filter((p) => typeof p === "string");
    const key = named.length ? named.join(".") : "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  throw new v.ValidationError(fieldErrors);
}

// Form fields named with dots ("pages.faq.title") into nested objects.
function unflatten(body = {}) {
  const out = {};
  for (const [name, value] of Object.entries(body)) {
    const parts = name.split(".");
    if (parts.some((p) => !p || p === "__proto__" || p === "constructor" || p === "prototype")) continue;
    let node = out;
    parts.slice(0, -1).forEach((p) => (node = node[p] = node[p] && typeof node[p] === "object" ? node[p] : {}));
    node[parts.at(-1)] = value;
  }
  return out;
}

// Validates and stores one group; returns { before, after } (both merged
// with the defaults) so the caller can describe the change.
async function save(group, input) {
  if (!GROUPS[group]) throw new Error(`Unknown settings group "${group}"`);
  const data = parseGroup(group, input);
  const before = await read(group);
  const value = JSON.stringify(data);
  const key = keyOf(group);
  if (await db()("settings").where({ key }).first()) await db()("settings").where({ key }).update({ value, updated_at: new Date() });
  else await db()("settings").insert({ key, value });
  cache.delete(group);
  return { before, after: merge(group, data) };
}

// The dotted names of the fields that differ between two values of a group.
function changedFields(before, after, prefix = "") {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].flatMap((k) => {
    const a = before?.[k];
    const b = after?.[k];
    if (a && b && typeof a === "object" && typeof b === "object") return changedFields(a, b, `${prefix}${k}.`);
    return (a ?? "") === (b ?? "") ? [] : [`${prefix}${k}`];
  });
}

function clearCache() {
  cache.clear();
}

// Uploaded images the settings point at (fields ending in "_media_id"), so
// the media clean-up never removes them.
async function mediaIds() {
  const rows = await db()("settings").where("key", "like", "settings.%").select("value");
  const ids = [];
  for (const row of rows) {
    try {
      for (const [k, val] of Object.entries(JSON.parse(row.value))) if (k.endsWith("_media_id") && Number.isInteger(val)) ids.push(val);
    } catch (err) {
      logger.warn({ err: { message: err.message } }, "a settings row is not valid JSON");
    }
  }
  return ids;
}

/* Helpers for templates and routes -------------------------------------------- */

// {destinations} and {partners}: the live counts, written as words up to
// twenty ("nine"), as the site's copy does.
function fill(textValue, counts = {}) {
  return String(textValue || "")
    .replace(/\{destinations\}/g, counts.destinations == null ? "{destinations}" : numberWord(counts.destinations))
    .replace(/\{partners\}/g, counts.partners == null ? "{partners}" : numberWord(counts.partners));
}

// "FAQ" -> "FAQ | MICE Namibia"; a title that already names the site is kept.
function composeTitle(title, siteName) {
  return title.includes(siteName) ? title : `${title} | ${siteName}`;
}

const telHref = (phone) => `tel:${String(phone).replace(/(?!^\+)[^\d]/g, "")}`;

module.exports = { GROUPS, SEO_PAGES, PAGE_LABELS, CACHE_MS, get, read, all, save, unflatten, changedFields, clearCache, mediaIds, fill, composeTitle, telHref };
