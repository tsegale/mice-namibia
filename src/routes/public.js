"use strict";

// Public website. Every page is rendered on the server from the database, so
// content is in the HTML (search engines, no JavaScript needed) and there is
// no client-side fetching that can race the page or fail on another host.

const express = require("express");
const config = require("../config");
const seo = require("../services/seo");
const settings = require("../services/settings");
const conferences = require("../repositories/conferences");
const posts = require("../repositories/posts");
const venues = require("../repositories/venues");
const speakers = require("../repositories/speakers");
const team = require("../repositories/team");
const pricing = require("../repositories/pricing");
const faqs = require("../repositories/faqs");
const partners = require("../repositories/partners");
const gallery = require("../repositories/gallery");
const { largestUrl } = require("../lib/picture");
const { conferenceIcs } = require("../lib/ics");
const C = require("../views/components");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
// `page` is a fixed page's key (title and description from Admin > Settings
// > SEO) or a ready page object (detail pages).
const render = async (res, view, page, data = {}) =>
  res.render(`pages/${view}`, { page: typeof page === "string" ? await seo.page(page, res.locals) : page, ...data });

// Public pages can be cached briefly by the browser; admins see changes on
// the next reload.
router.use((req, res, next) => {
  res.set("Cache-Control", "public, max-age=0, must-revalidate");
  next();
});

router.get(
  "/",
  wrap(async (req, res) => {
    const [upcoming, all, featuredVenues, homeSpeakers, homeFaqs, marqueePartners, stripItems] = await Promise.all([
      conferences.upcoming(),
      posts.published(),
      venues.featured(),
      speakers.forHome(4),
      faqs.forHome(),
      partners.published({ marquee: true }),
      gallery.published({ home: true }),
    ]);
    const homePricing = await pricing.forHome(upcoming);
    await render(res, "home", "home", { upcoming, latestPosts: all.slice(0, 3), featuredVenues, homeSpeakers, homeFaqs, marqueePartners, stripItems, homePricing });
  })
);

router.get(
  "/about",
  wrap(async (req, res) => {
    const [upcoming, marqueePartners, stripItems] = await Promise.all([conferences.upcoming(), partners.published({ marquee: true }), gallery.published({ home: true })]);
    await render(res, "about", "about", { upcoming, marqueePartners, stripItems });
  })
);

router.get(
  "/services",
  wrap(async (req, res) => {
    const all = await posts.published();
    const picks = all.filter((p) => p.services_position).sort((a, b) => a.services_position - b.services_position);
    await render(res, "services", "services", { servicePosts: (picks.length ? picks : all).slice(0, 3) });
  })
);

router.get(
  "/faq",
  wrap(async (req, res) => {
    const [faqGroups, marqueePartners] = await Promise.all([faqs.publishedGroups(), partners.published({ marquee: true })]);
    await render(res, "faq", { ...(await seo.page("faq", res.locals)), jsonld: faqGroups.length ? [C.faqs.jsonLd(faqGroups)] : [] }, { faqGroups, marqueePartners });
  })
);

router.get(
  "/partners",
  wrap(async (req, res) => {
    const list = await partners.published();
    await render(res, "partners", "partners", { partners: list, partnerCounts: partners.counts(list) });
  })
);

router.get(
  "/gallery",
  wrap(async (req, res) => {
    const galleryItems = await gallery.published();
    await render(res, "gallery", "gallery", { galleryItems, galleryCategories: await gallery.categories(galleryItems) });
  })
);

for (const name of ["privacy-policy", "terms-and-conditions"]) {
  router.get(`/${name}`, wrap((req, res) => render(res, name, name)));
}

router.get(
  "/pricing",
  wrap(async (req, res) => {
    const upcoming = await conferences.upcoming();
    await render(res, "pricing", "pricing", { upcoming, tiers: await pricing.forPricingPage(upcoming) });
  })
);
// /contact is in routes/forms.js with the form handlers.
router.get(
  "/team",
  wrap(async (req, res) => {
    const [teamSpeakers, teamMembers, ceo] = await Promise.all([speakers.forTeamPage(8), team.published(), team.ceo()]);
    await render(res, "team", "team", { teamSpeakers, teamMembers, ceo });
  })
);

/* Events -------------------------------------------------------------------- */

router.get("/events", wrap(async (req, res) => render(res, "events", "events", { upcoming: await conferences.upcoming() })));

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
        title: await seo.title(`${conference.short_title} | ${conference.city}`),
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

router.get("/blog", wrap(async (req, res) => render(res, "blog", "blog", { posts: await posts.published() })));

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
        title: await seo.title(post.seo_title || post.title),
        description: post.seo_description || post.excerpt,
        path: post.url,
        image: largestUrl(post.cover) || null,
        ogType: "article",
        nav: "/blog",
        jsonld: [C.posts.jsonLd(post, config.baseUrl, (await settings.get("footer")).copyright_holder)],
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
    await render(res, "venues", "venues", { venues: list, categories, countries });
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
        title: `${venue.name} | ${(await settings.get("seo")).site_name} Venues`,
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
