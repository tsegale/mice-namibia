"use strict";

// Ticket tier cards, shared by the Pricing page and the homepage section.
// A tier without a price for the conference shows "Price on request"; the
// Request Pricing link prefills the contact form with the conference and
// tier either way.

const { escapeHtml: esc } = require("../../lib/text");

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>';
const ON_REQUEST = "Price on request";

// tier.prices: { conference slug: "N$ 1 250" }. On the Pricing page the
// picker switches conferences in the browser, so every price travels in
// data-prices; the page is rendered for `conference` (the first one).
function card(t, conference) {
  const slug = conference ? conference.slug : "";
  const price = (conference && t.prices[conference.slug]) || ON_REQUEST;
  const dataPrices = Object.keys(t.prices).length ? ` data-prices="${esc(JSON.stringify(t.prices))}"` : "";
  return `      <article class="pricing-card${t.highlighted ? " pricing-card--featured" : ""}">
${t.highlighted ? '        <span class="pricing-badge">Most popular</span>\n' : ""}        <h3 class="pricing-card-name">${esc(t.name)}</h3>
        <p class="pricing-card-for">Tickets for <strong data-ticket-for>${conference ? esc(conference.short_title) : ""}</strong></p>
        <p class="pricing-card-price"${dataPrices}>${esc(price)}</p>
${t.tagline ? `        <p class="pricing-card-desc">${esc(t.tagline)}</p>\n` : ""}        <ul class="pricing-card-features">
${t.features.map((f) => `          <li>${TICK}<span>${esc(f)}</span></li>`).join("\n")}
        </ul>
        <a data-ticket-link href="/contact?type=proposal&amp;event=${esc(slug)}&amp;tier=${esc(encodeURIComponent(t.name))}#contact-form" class="btn ${t.highlighted ? "btn-primary" : "btn-secondary"}">Request Pricing<span class="visually-hidden">: ${esc(t.name)}</span></a>
      </article>`;
}

function cards(tiers, conference) {
  return tiers.map((t) => card(t, conference)).join("\n");
}

// True when any tier has a real price for any conference shown.
const hasPrices = (tiers) => tiers.some((t) => Object.keys(t.prices).length);

module.exports = { card, cards, hasPrices, ON_REQUEST };
