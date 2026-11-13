"use strict";

const { db } = require("../db/knex");
const { formatPrice } = require("../lib/money");

const parseFeatures = (t) => {
  try {
    const list = JSON.parse(t.features || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

// Tiers in display order, features as a list.
async function tiers({ published = false } = {}) {
  const q = db()("pricing_tiers").orderBy("sort_order").orderBy("id");
  if (published) q.where({ status: "published" });
  return (await q).map((t) => ({ ...t, features: parseFeatures(t) }));
}

// conference id -> tier id -> { amount_cents, currency, label }.
async function pricesFor(conferenceIds) {
  const out = new Map();
  if (!conferenceIds.length) return out;
  const rows = await db()("conference_prices").whereIn("conference_id", conferenceIds);
  for (const r of rows) {
    if (!out.has(r.conference_id)) out.set(r.conference_id, new Map());
    out.get(r.conference_id).set(r.tier_id, { amount_cents: r.amount_cents, currency: r.currency, label: formatPrice(r.amount_cents, r.currency) });
  }
  return out;
}

// The Pricing page: published tiers, each with its price per upcoming
// conference ({ slug: "N$ 1 250" }) for the "Tickets for" picker.
async function forPricingPage(upcoming) {
  const [list, prices] = await Promise.all([tiers({ published: true }), pricesFor(upcoming.map((c) => c.id))]);
  return list.map((t) => ({
    ...t,
    prices: Object.fromEntries(upcoming.filter((c) => prices.get(c.id)?.has(t.id)).map((c) => [c.slug, prices.get(c.id).get(t.id).label])),
  }));
}

// The homepage section (spec 01 p.7): the next upcoming conference and its
// tiers, but only once that conference has at least one real price.
async function forHome(upcoming) {
  const next = upcoming[0];
  if (!next) return null;
  const list = await forPricingPage([next]);
  return list.some((t) => t.prices[next.slug]) ? { conference: next, tiers: list } : null;
}

module.exports = { tiers, pricesFor, forPricingPage, forHome, parseFeatures };
