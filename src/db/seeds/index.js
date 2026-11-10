"use strict";

// Seeds the database from the content that was reviewed and approved on the
// static site (content/data/*.json, content/data/post-bodies/*.html and the
// images already in public/assets). Nothing is invented here.
//
// Safe to run more than once: every row is matched on its natural key (slug,
// iso2, name, base_url) and only inserted when missing. It never deletes or
// overwrites anything, so running it against a live database cannot wipe the
// client's edits (Zusammen's seed script cleared all tours, blogs and
// enquiries before inserting).

const fs = require("node:fs");
const path = require("node:path");
const { readingMinutes, slugify } = require("../../lib/text");
const { richText } = require("../../lib/sanitize");

const ROOT = path.resolve(__dirname, "../../..");
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "content/data");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));

// The nine destinations, in the order of the venues brief's country filter.
const DESTINATIONS = [
  ["na", "Namibia", "Africa/Windhoek"],
  ["bw", "Botswana", "Africa/Gaborone"],
  ["za", "South Africa", "Africa/Johannesburg"],
  ["zm", "Zambia", "Africa/Lusaka"],
  ["zw", "Zimbabwe", "Africa/Harare"],
  ["tz", "Tanzania", "Africa/Dar_es_Salaam"],
  ["ke", "Kenya", "Africa/Nairobi"],
  ["rw", "Rwanda", "Africa/Kigali"],
  ["ug", "Uganda", "Africa/Kampala"],
];

// From content/specs/06-venues-spec.pdf, in the client's order.
const VENUE_TAGS = [
  "Business hotels", "Airport hotels", "Luxury hotels", "Boutique hotels", "Convention halls", "Congress centres",
  "Multi-purpose event centres", "Boardrooms", "Training rooms", "Seminar rooms", "Meeting suites", "Exhibition halls",
  "Trade show venues", "Expo centres", "Beach resorts", "Mountain resorts", "Golf resorts", "Spa resorts", "Ballrooms",
  "Function halls", "Wedding venues", "Gala dinner venues", "Executive boardrooms", "Innovation hubs", "Training centres",
  "Company auditoriums", "Sports stadiums", "Indoor arenas", "Concert venues", "Racecourses", "Museums", "Art galleries",
  "Heritage buildings", "Aquariums", "Botanical gardens", "Gardens", "Parks", "Beaches", "Vineyards", "Rooftop venues",
  "Open-air amphitheatres",
];

// Homepage carousel photos chosen on the reviewed homepage (wider shots than
// the listing cards).
const HOME_CAROUSEL = {
  wicc: "assets/images/venues/wicc/event-3",
  "windhoek-country-club": "assets/images/venues/windhoek-country-club-resort-casino/exterior",
  movenpick: "assets/images/venues/movenpick/exterior-facade",
  "westin-cape-town": "assets/images/venues/the-westin-cape-town/exterior",
};

const SAMPLE_SPEAKERS = [
  ["Keynote Speaker", "sample-speaker-01"],
  ["Panel Speaker", "sample-speaker-02"],
  ["Workshop Lead", "sample-speaker-03"],
  ["Guest Speaker", "sample-speaker-04"],
];

function paragraphs(list) {
  return list.map((p) => `<p>${p.replace(/&(?![a-z#0-9]+;)/gi, "&amp;").replace(/</g, "&lt;")}</p>`).join("\n");
}

async function upsert(knex, table, where, row) {
  const existing = await knex(table).where(where).first();
  if (existing) return { id: existing.id ?? existing.iso2, created: false };
  const [id] = await knex(table).insert({ ...where, ...row });
  return { id: id || where.iso2, created: true };
}

function createMediaRegistry(knex, sharp) {
  const cache = new Map();
  // base is a path inside public/, without the -640.jpg suffix.
  return async function media(base, alt = "") {
    const baseUrl = `/${base.replace(/^\/+/, "")}`;
    if (cache.has(baseUrl)) return cache.get(baseUrl);
    const existing = await knex("media").where({ base_url: baseUrl }).first();
    if (existing) {
      cache.set(baseUrl, existing.id);
      return existing.id;
    }
    const abs = path.join(PUBLIC, base);
    const widths = [640, 1280, 1920].filter((w) => fs.existsSync(`${abs}-${w}.jpg`));
    if (!widths.length) throw new Error(`No image variants found for ${base}`);
    const formats = widths.every((w) => fs.existsSync(`${abs}-${w}.webp`)) ? "webp,jpg" : "jpg";
    const fw = widths.includes(1280) ? 1280 : widths[widths.length - 1];
    const meta = await sharp(`${abs}-${fw}.jpg`).metadata();
    const [id] = await knex("media").insert({
      base_url: baseUrl,
      widths: widths.join(","),
      formats,
      width: meta.width,
      height: meta.height,
      alt,
      original_name: path.basename(base),
      mime: "image/jpeg",
      is_upload: false,
    });
    cache.set(baseUrl, id);
    return id;
  };
}

async function run(knex, { log = () => {} } = {}) {
  const sharp = require("sharp");
  const counts = {};
  const tally = (key, created) => {
    counts[key] = counts[key] || { created: 0, kept: 0 };
    counts[key][created ? "created" : "kept"]++;
  };

  await knex.transaction(async (trx) => {
    const m = createMediaRegistry(trx, sharp);

    /* Countries, categories, tags ------------------------------------------ */
    for (const [i, [iso2, name, timezone]] of DESTINATIONS.entries()) {
      const r = await upsert(trx, "countries", { iso2 }, { name, timezone, is_destination: true, sort_order: i });
      tally("countries", r.created);
    }

    const venueData = readJson("venues.json");
    const venueCategoryIds = {};
    for (const [i, name] of venueData.venue_categories.entries()) {
      const r = await upsert(trx, "venue_categories", { name }, { slug: slugify(name), sort_order: i });
      venueCategoryIds[name] = r.id;
      tally("venue_categories", r.created);
    }
    const tagIds = {};
    for (const [i, name] of VENUE_TAGS.entries()) {
      const r = await upsert(trx, "venue_tags", { name }, { slug: slugify(name), sort_order: i });
      tagIds[name] = r.id;
      tally("venue_tags", r.created);
    }

    /* Speakers (stock "Sample" cards until real speakers consent) ------------- */
    for (const [i, [role, file]] of SAMPLE_SPEAKERS.entries()) {
      const photo = await m(`assets/images/speakers/${file}`, "");
      const r = await upsert(trx, "speakers", { slug: `sample-speaker-${i + 1}` }, {
        name: "Speaker to be announced",
        role,
        photo_media_id: photo,
        is_sample: true,
        consent_confirmed: false,
        show_on_home: true,
        status: "published",
        sort_order: i,
      });
      tally("speakers", r.created);
    }

    /* Conferences --------------------------------------------------------------- */
    const confData = readJson("conferences.json");
    for (const c of confData.conferences) {
      const cover = await m(c.cover.src.replace(/\.jpg$/, ""), c.cover.alt);
      const r = await upsert(trx, "conferences", { slug: c.slug }, {
        title: c.title,
        short_title: c.short_title,
        starts_at: new Date(c.starts_at),
        ends_at: new Date(c.ends_at),
        timezone: c.timezone,
        city: c.city,
        country_iso2: c.country_iso2,
        organiser: c.organiser || "",
        excerpt: c.excerpt || "",
        body: paragraphs(c.body),
        pull_quote: c.pull_quote || null,
        cover_media_id: cover,
        cover_alt: c.cover.alt || "",
        featured: true,
        images_are_stand_ins: Boolean(c.images_are_stand_ins),
        status: "published",
      });
      tally("conferences", r.created);
      if (r.created) {
        for (const [j, g] of (c.gallery || []).entries()) {
          await trx("conference_images").insert({ conference_id: r.id, media_id: await m(g.src.replace(/\.jpg$/, ""), g.alt), alt: g.alt || "", sort_order: j });
        }
      }
    }

    /* Venues --------------------------------------------------------------------- */
    for (const [i, v] of venueData.venues.entries()) {
      const card = await m(v.card_image, v.gallery?.[0] || "");
      const r = await upsert(trx, "venues", { slug: v.slug }, {
        name: v.name,
        full_name: v.full_name || v.name,
        category_id: venueCategoryIds[v.category] || null,
        city: v.city,
        country_iso2: v.country_iso2,
        description: paragraphs(v.description),
        map_query: v.map_query || "",
        card_media_id: card,
        home_media_id: HOME_CAROUSEL[v.slug] ? await m(HOME_CAROUSEL[v.slug], "") : null,
        featured_on_home: true,
        status: "published",
        sort_order: i,
      });
      tally("venues", r.created);
      if (r.created) {
        for (const tag of v.tags) {
          if (!tagIds[tag]) throw new Error(`Venue ${v.slug} uses unknown tag "${tag}"`);
          await trx("venue_tag").insert({ venue_id: r.id, tag_id: tagIds[tag] });
        }
        for (const [j, alt] of (v.gallery || []).entries()) {
          const base = `${v.gallery_dir}/gallery-${String(j + 1).padStart(2, "0")}`;
          await trx("venue_images").insert({ venue_id: r.id, media_id: await m(base, alt), alt, sort_order: j });
        }
      }
    }

    /* Blog -------------------------------------------------------------------------- */
    const postData = readJson("posts.json");
    const categoryNames = [...new Set(postData.posts.map((p) => p.category))];
    const postCategoryIds = {};
    for (const [i, name] of categoryNames.entries()) {
      const r = await upsert(trx, "post_categories", { name }, { slug: slugify(name), sort_order: i });
      postCategoryIds[name] = r.id;
      tally("post_categories", r.created);
    }
    const servicesPicks = postData.placements?.services || [];
    const now = Date.now();
    for (const p of postData.posts) {
      const body = richText(fs.readFileSync(path.join(DATA, "post-bodies", `${p.slug}.html`), "utf8"));
      const cover = await m(p.image.base, p.image.alt || "");
      const slug = slugify(p.title);
      const r = await upsert(trx, "posts", { slug }, {
        title: p.title,
        category_id: postCategoryIds[p.category],
        excerpt: p.excerpt,
        body,
        cover_media_id: cover,
        cover_alt: p.image.alt || "",
        reading_minutes: p.reading_minutes || readingMinutes(body),
        status: "published",
        // No publish dates exist yet; keep the reviewed order (highest n newest).
        published_at: new Date(now - (postData.posts.length - p.n + 1) * 60000),
        services_position: servicesPicks.includes(p.slug) ? servicesPicks.indexOf(p.slug) + 1 : null,
      });
      tally("posts", r.created);
      // Old static URL keeps working.
      const red = await upsert(trx, "redirects", { from_path: `/${p.slug}.html` }, { to_path: `/blog/${slug}`, status_code: 301 });
      tally("redirects", red.created);
    }

    /* Legacy .html addresses from the static review build -------------------------- */
    const legacy = {
      "/index.html": "/",
      "/sponsors.html": "/partners",
      ...Object.fromEntries(
        ["about", "services", "events", "blog", "venues", "gallery", "faq", "partners", "pricing", "contact", "team", "privacy-policy", "terms-and-conditions"].map((p) => [`/${p}.html`, `/${p}`])
      ),
      ...Object.fromEntries(confData.conferences.map((c) => [`/event-${c.slug}.html`, `/events/${c.slug}`])),
      ...Object.fromEntries(venueData.venues.map((v) => [`/${v.file}`, `/venues/${v.slug}`])),
    };
    for (const [from, to] of Object.entries(legacy)) {
      const r = await upsert(trx, "redirects", { from_path: from }, { to_path: to, status_code: 301 });
      tally("redirects", r.created);
    }
  });

  for (const [table, c] of Object.entries(counts)) log(`${table.padEnd(18)} ${c.created} added, ${c.kept} already there`);
  return counts;
}

module.exports = { run, DESTINATIONS, VENUE_TAGS };
