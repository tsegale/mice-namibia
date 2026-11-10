"use strict";

// Public website. Every page is rendered on the server from the database, so
// content is in the HTML (search engines, no JavaScript needed) and there is
// no client-side fetching that can race the page or fail on another host.

const express = require("express");
const config = require("../config");
const META = require("./page-meta");
const conferences = require("../repositories/conferences");
const posts = require("../repositories/posts");
const venues = require("../repositories/venues");
const speakers = require("../repositories/speakers");
const { largestUrl } = require("../lib/picture");
const { conferenceIcs } = require("../lib/ics");
const C = require("../views/components");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const render = (res, view, page, data = {}) => res.render(`pages/${view}`, { page, ...data });

// Public pages can be cached briefly by the browser; admins see changes on
// the next reload.
router.use((req, res, next) => {
  res.set("Cache-Control", "public, max-age=0, must-revalidate");
  next();
});

router.get(
  "/",
  wrap(async (req, res) => {
    const [upcoming, all, featuredVenues, homeSpeakers] = await Promise.all([conferences.upcoming(), posts.published(), venues.featured(), speakers.forHome(4)]);
    render(res, "home", META.home, { upcoming, latestPosts: all.slice(0, 3), featuredVenues, homeSpeakers });
  })
);

router.get(
  "/about",
  wrap(async (req, res) => render(res, "about", META.about, { upcoming: await conferences.upcoming() }))
);

router.get(
  "/services",
  wrap(async (req, res) => {
    const all = await posts.published();
    const picks = all.filter((p) => p.services_position).sort((a, b) => a.services_position - b.services_position);
    render(res, "services", META.services, { servicePosts: (picks.length ? picks : all).slice(0, 3) });
  })
);

for (const name of ["gallery", "faq", "partners", "privacy-policy", "terms-and-conditions"]) {
  router.get(`/${name}`, (req, res) => render(res, name, META[name]));
}

router.get("/pricing", wrap(async (req, res) => render(res, "pricing", META.pricing, { upcoming: await conferences.upcoming() })));
router.get("/contact", wrap(async (req, res) => render(res, "contact", META.contact, { upcoming: await conferences.upcoming() })));
router.get("/team", wrap(async (req, res) => render(res, "team", META.team, { teamSpeakers: await speakers.forTeamPage(8) })));

/* Events -------------------------------------------------------------------- */

router.get("/events", wrap(async (req, res) => render(res, "events", META.events, { upcoming: await conferences.upcoming() })));

router.get(
  "/events/:slug.ics",
  wrap(async (req, res, next) => {
    const c = await conferences.publishedBySlug(req.params.slug);
    if (!c) return next();
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${c.slug}.ics"`);
    res.send(conferenceIcs(c, config.baseUrl));
  })
);

router.get(
  "/events/:slug",
  wrap(async (req, res, next) => {
    const conference = await conferences.publishedBySlug(req.params.slug);
    if (!conference) return next();
    const others = (await conferences.upcoming()).filter((o) => o.id !== conference.id);
    render(
      res,
      "event",
      {
        title: `${conference.short_title} | ${conference.city} | MICE Namibia`,
        description: conference.excerpt,
        path: conference.url,
        image: largestUrl(conference.cover) || null,
        nav: "/events",
        jsonld: [C.conferences.jsonLd(conference, config.baseUrl)],
      },
      { conference, others }
    );
  })
);

/* Blog --------------------------------------------------------------------------- */

router.get("/blog", wrap(async (req, res) => render(res, "blog", META.blog, { posts: await posts.published() })));

router.get(
  "/blog/:slug",
  wrap(async (req, res, next) => {
    const all = await posts.published();
    const post = all.find((p) => p.slug === req.params.slug);
    if (!post) return next();
    render(
      res,
      "post",
      {
        title: `${post.seo_title || post.title} | MICE Namibia`,
        description: post.seo_description || post.excerpt,
        path: post.url,
        image: largestUrl(post.cover) || null,
        ogType: "article",
        nav: "/blog",
        jsonld: [C.posts.jsonLd(post, config.baseUrl)],
      },
      { post, posts: all, article: C.posts.withHeadingIds(post.body) }
    );
  })
);

/* Venues -------------------------------------------------------------------------- */

router.get(
  "/venues",
  wrap(async (req, res) => {
    const [list, categories, countries] = await Promise.all([venues.published(), venues.categories(), venues.countries()]);
    render(res, "venues", META.venues, { venues: list, categories, countries });
  })
);

router.get(
  "/venues/:slug",
  wrap(async (req, res, next) => {
    const venue = await venues.publishedBySlug(req.params.slug);
    if (!venue) return next();
    const others = (await venues.published()).filter((o) => o.id !== venue.id);
    render(
      res,
      "venue",
      {
        title: `${venue.name} | MICE Namibia Venues`,
        description: String(venue.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
        path: venue.url,
        image: largestUrl(venue.gallery[0]?.media || venue.card) || null,
        nav: "/venues",
        jsonld: [C.venues.jsonLd(venue, config.baseUrl)],
      },
      { venue, others }
    );
  })
);

/* Search engines ------------------------------------------------------------------- */

router.get(
  "/sitemap.xml",
  wrap(async (req, res) => {
    const [cs, ps, vs] = await Promise.all([conferences.upcoming(), posts.published(), venues.published()]);
    const fixed = ["/", "/about", "/services", "/events", "/blog", "/venues", "/gallery", "/faq", "/partners", "/pricing", "/contact", "/team", "/privacy-policy", "/terms-and-conditions"];
    const urls = [
      ...fixed.map((p) => ({ loc: p })),
      ...cs.map((c) => ({ loc: c.url, lastmod: c.updated_at })),
      ...ps.map((p) => ({ loc: p.url, lastmod: p.updated_at })),
      ...vs.map((v) => ({ loc: v.url, lastmod: v.updated_at })),
    ];
    const xml = urls
      .map((u) => `  <url><loc>${config.baseUrl}${u.loc}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ""}</url>`)
      .join("\n");
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xml}\n</urlset>\n`);
  })
);

router.get("/robots.txt", (req, res) => {
  const body =
    config.siteEnv === "production"
      ? `User-agent: *\nDisallow: /admin\n\nSitemap: ${config.baseUrl}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n";
  res.type("text/plain").send(body);
});

module.exports = router;
