"use strict";

// Admin > Pages > Destinations: the countries the site works in. Every
// destination list on the site follows this table (homepage tiles, footer
// flags, contact form and list, venue filter, Services and Partners tiles).
// A country can only be added from the flag files the site ships, its iso2
// code and timezone never change afterwards, and a destination that venues or
// events use cannot be switched off.

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const config = require("../../config");
const { db } = require("../../db/knex");
const media = require("../../repositories/media");
const destinations = require("../../repositories/destinations");
const { audit } = require("../../repositories/audit");
const { parse, ValidationError } = require("../../validation/common");
const { destination: schema, newDestination: newSchema } = require("../../validation/destinations");
const { assertMedia, nextSortOrder } = require("../../services/content");
const { reorderHandler } = require("./reorder");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const FLAGS_DIR = path.join(config.root, "public", "assets", "images", "flags");
const regionName = new Intl.DisplayNames(["en"], { type: "region" });
const nameOf = (iso2) => {
  try {
    return regionName.of(iso2.toUpperCase()) || iso2.toUpperCase();
  } catch {
    return iso2.toUpperCase();
  }
};

// Countries that have a flag file and are not in the table yet.
async function availableFlags() {
  const taken = new Set(await db()("countries").pluck("iso2"));
  return fs
    .readdirSync(FLAGS_DIR)
    .map((f) => /^([a-z]{2})\.svg$/.exec(f)?.[1])
    .filter((iso2) => iso2 && !taken.has(iso2))
    .map((iso2) => ({ iso2, name: nameOf(iso2) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const TIMEZONES = Intl.supportedValuesOf("timeZone").sort((a, b) => Number(!a.startsWith("Africa/")) - Number(!b.startsWith("Africa/")) || a.localeCompare(b));

router.get(
  "/",
  wrap(async (req, res) => {
    const rows = await destinations.all();
    const open = req.query.edit ? `/admin/destinations/${encodeURIComponent(String(req.query.edit))}/edit` : null;
    res.render("admin/destinations/list", { title: "Destinations", rows, live: rows.filter((r) => r.is_destination).length, open });
  })
);

router.get(
  "/new",
  wrap(async (req, res) => {
    res.render("admin/destinations/form", { d: { is_destination: true }, photo: null, flags: await availableFlags(), timezones: TIMEZONES, usage: null });
  })
);

router.get(
  "/:iso2/edit",
  wrap(async (req, res, next) => {
    const d = await db()("countries").where({ iso2: req.params.iso2 }).first();
    if (!d) return next();
    const photo = d.photo_media_id ? (await media.byIds([d.photo_media_id])).get(d.photo_media_id) || null : null;
    res.render("admin/destinations/form", { d, photo, flags: [], timezones: [], usage: await destinations.usage(d.iso2) });
  })
);

function rowFrom(data) {
  return {
    name: data.name,
    hook: data.hook,
    cities: data.cities,
    photo_media_id: data.photo_media_id,
    photo_alt: data.photo_alt,
    is_destination: data.is_destination,
  };
}

router.post(
  "/",
  wrap(async (req, res) => {
    const data = parse(newSchema, req.body);
    if (!fs.existsSync(path.join(FLAGS_DIR, `${data.iso2}.svg`))) throw new ValidationError({ iso2: "There is no flag for that country. Choose one from the list." });
    if (await db()("countries").where({ iso2: data.iso2 }).first()) throw new ValidationError({ iso2: "That country is already in the list." });
    if (!TIMEZONES.includes(data.timezone)) throw new ValidationError({ timezone: "Choose a timezone from the list." });
    if (data.photo_media_id && !data.photo_alt) throw new ValidationError({ photo_alt: "Describe the photo (for screen readers and search engines)." });
    await assertMedia([data.photo_media_id], "photo_media_id");
    await db()("countries").insert({ iso2: data.iso2, timezone: data.timezone, ...rowFrom(data), sort_order: await nextSortOrder(db(), "countries") });
    await audit(req, { action: "create", entity: "country", entityId: null, summary: `added the destination ${data.name} (${data.iso2})` });
    res.status(201).json({ ok: true, message: data.is_destination ? "Destination added and live" : "Country added (not shown as a destination)" });
  })
);

router.put(
  "/:iso2",
  wrap(async (req, res, next) => {
    const existing = await db()("countries").where({ iso2: req.params.iso2 }).first();
    if (!existing) return next();
    const data = parse(schema, req.body);
    if (existing.is_destination && !data.is_destination) {
      const { venues, conferences } = await destinations.usage(existing.iso2);
      if (venues.length || conferences.length) {
        const parts = [venues.length ? `venues: ${venues.join(", ")}` : "", conferences.length ? `events: ${conferences.join(", ")}` : ""].filter(Boolean);
        throw new ValidationError(
          { is_destination: `${existing.name} is used by ${parts.join("; ")}. Move them to another country before switching it off.` },
          `${existing.name} is still in use, so it cannot be switched off.`
        );
      }
    }
    if (data.photo_media_id && !data.photo_alt) throw new ValidationError({ photo_alt: "Describe the photo (for screen readers and search engines)." });
    await assertMedia([data.photo_media_id], "photo_media_id");
    const row = rowFrom(data);
    await db()("countries").where({ iso2: existing.iso2 }).update(row);
    if (existing.photo_media_id !== row.photo_media_id) await media.releaseIfUnused([existing.photo_media_id]);
    const change = existing.is_destination !== row.is_destination ? (row.is_destination ? " and switched it on" : " and switched it off") : "";
    await audit(req, { action: "update", entity: "country", entityId: null, summary: `updated the destination ${row.name} (${existing.iso2})${change}` });
    res.json({ ok: true, message: row.is_destination ? "Destination saved and live" : "Saved; no longer shown as a destination" });
  })
);

router.patch("/reorder", reorderHandler({ table: "countries", entity: "country", label: "destinations", key: "iso2" }));

module.exports = router;
