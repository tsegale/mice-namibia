"use strict";

// Page titles and descriptions from Admin > Settings > SEO, on top of the
// fixed page details in routes/page-meta.js (address, share image, menu).

const META = require("../routes/page-meta");
const settings = require("./settings");

// The `page` object a public template needs, for one of the fixed pages.
// {destinations} and {partners} in the text become the live counts.
async function page(key, locals = {}) {
  const meta = META[key];
  if (!meta) throw new Error(`Unknown page "${key}"`);
  const seo = await settings.get("seo");
  const text = seo.pages[key] || meta;
  const counts = locals.siteCounts || {};
  return {
    ...meta,
    title: settings.composeTitle(settings.fill(text.title, counts), seo.site_name),
    description: settings.fill(text.description, counts),
  };
}

// A title for a detail page (event, article, venue).
async function title(text) {
  return settings.composeTitle(text, (await settings.get("seo")).site_name);
}

module.exports = { page, title };
