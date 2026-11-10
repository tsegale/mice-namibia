"use strict";

// Venue markup for the homepage carousel, the Venues listing and venue
// pages. Ported 1:1 from tools/build-venues.mjs, now fed from the database.

const { escapeHtml: esc } = require("../../lib/text");
const { picture, largestUrl } = require("../../lib/picture");
const { VENUE: ICON, flag } = require("./icons");

// "Hotels" -> "Hotel", "Convention Centres" -> "Convention Centre".
const singular = (c) => String(c || "").replace(/ and Arenas$/, " and Arena").replace(/s$/, "");

function proposalUrl(v) {
  return `/contact?type=proposal&amp;venue=${encodeURIComponent(v.name)}&amp;destination=${encodeURIComponent(v.country)}#contact-form`;
}

function slide(v) {
  return `<li class="venue-slide">
  <article class="venue-slide-card">
    ${picture(v.homeImage || v.card, { sizes: "(max-width: 720px) 85vw, 560px" })}
    <div class="venue-slide-body">
      <span class="chip chip--category">${esc(singular(v.category))}</span>
      <p class="venue-slide-city">${flag(v.country_iso2)}${esc(v.city)}, ${esc(v.country)}</p>
      <h3><a href="${v.url}" class="card-link">${esc(v.name)}</a></h3>
      <span class="venue-slide-more" aria-hidden="true">View Details ${ICON.arrow}</span>
    </div>
  </article>
</li>`;
}

function card(v, i) {
  return `<article class="venue-card-lg" data-venue data-category="${esc(v.category || "")}" data-country="${v.country_iso2}" data-tags="${esc(v.tags.join("|"))}" data-name="${esc(v.name)}" data-order="${i}">
  <div class="venue-card-lg-media">
    ${picture(v.card, { sizes: "(max-width: 900px) 100vw, 440px", alt: v.card?.alt || "" })}
    <span class="chip chip--category">${esc(singular(v.category))}</span>
  </div>
  <div class="venue-card-lg-body">
    <h3><a href="${v.url}" class="card-link">${esc(v.name)}</a></h3>
    <p class="venue-card-lg-country">${flag(v.country_iso2)}<span>${esc(v.city)}, ${esc(v.country)}</span></p>
    <span class="btn btn-secondary venue-card-lg-btn" aria-hidden="true">View Details</span>
  </div>
</article>`;
}

function filters(venues, categories, countries) {
  const count = (fn) => venues.filter(fn).length;
  const usedTags = [...new Set(venues.flatMap((v) => v.tags))].sort();
  return `<aside class="venue-filters" aria-label="Filter venues">
  <div class="venue-filter">
    <h2 class="venue-filter-title" id="vf-category">Venue Category</h2>
    <ul aria-labelledby="vf-category">
      <li><button type="button" class="venue-filter-opt is-active" data-filter="category" data-value="" aria-pressed="true">All categories <span>${venues.length}</span></button></li>
${categories
  .filter((c) => count((v) => v.category === c.name))
  .map((c) => `      <li><button type="button" class="venue-filter-opt" data-filter="category" data-value="${esc(c.name)}" aria-pressed="false">${esc(c.name)} <span>${count((v) => v.category === c.name)}</span></button></li>`)
  .join("\n")}
    </ul>
  </div>
  <div class="venue-filter">
    <h2 class="venue-filter-title" id="vf-country">Filter by Country</h2>
    <ul aria-labelledby="vf-country">
      <li><button type="button" class="venue-filter-opt is-active" data-filter="country" data-value="" aria-pressed="true">All countries <span>${venues.length}</span></button></li>
${countries
  .map((c) => {
    const n = count((v) => v.country_iso2 === c.iso2);
    return `      <li><button type="button" class="venue-filter-opt" data-filter="country" data-value="${c.iso2}" aria-pressed="false"${n ? "" : " disabled"}>${flag(c.iso2, 20, 15)}${esc(c.name)} <span>${n}</span></button></li>`;
  })
  .join("\n")}
    </ul>
  </div>
  <div class="venue-filter">
    <h2 class="venue-filter-title" id="vf-tags">Product Categories</h2>
    <ul class="venue-tag-list" aria-labelledby="vf-tags">
${usedTags.map((t) => `      <li><button type="button" class="venue-tag" data-filter="tag" data-value="${esc(t)}" aria-pressed="false">${esc(t)}</button></li>`).join("\n")}
    </ul>
  </div>
</aside>`;
}

function gallery(v) {
  const g = v.gallery;
  return `<div class="venue-gallery" data-venue-gallery data-lightbox aria-roledescription="carousel" aria-label="${esc(v.name)} photo gallery">
  <div class="venue-gallery-stage">
${g
  .map(
    (im, i) => `    <a href="${largestUrl(im.media)}" class="venue-gallery-slide${i === 0 ? " is-active" : ""}" data-venue-slide data-lightbox-item data-caption="${esc(im.alt)}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${g.length}: ${esc(im.alt)}"${i === 0 ? "" : ' aria-hidden="true" tabindex="-1"'}>
      ${picture(im.media, { sizes: "(max-width: 1080px) 100vw, 680px", alt: im.alt, lazy: i !== 0 })}
    </a>`
  )
  .join("\n")}
    <button type="button" class="venue-gallery-nav venue-gallery-nav--prev" data-venue-prev aria-label="Previous photo">${ICON.prev}</button>
    <button type="button" class="venue-gallery-nav venue-gallery-nav--next" data-venue-next aria-label="Next photo">${ICON.next}</button>
    <div class="venue-gallery-bar">
      <span class="venue-gallery-counter" data-venue-counter aria-live="polite">1 / ${g.length}</span>
      <span class="venue-gallery-hint">${ICON.expand}Click to enlarge</span>
      <button type="button" class="venue-gallery-pause" data-venue-pause aria-label="Pause slideshow" aria-pressed="false">${ICON.pause}</button>
    </div>
  </div>
  <div class="venue-gallery-thumbs" role="group" aria-label="Choose a photo">
${g
  .map(
    (im, i) => `    <button type="button" class="venue-gallery-thumb${i === 0 ? " is-active" : ""}" data-venue-thumb="${i}" aria-label="Show photo ${i + 1}: ${esc(im.alt)}"${i === 0 ? ' aria-current="true"' : ""}>
      ${picture(im.media, { sizes: "120px", alt: "" })}
    </button>`
  )
  .join("\n")}
  </div>
</div>`;
}

function miniCard(o) {
  return `<article class="card venue-mini">
  <div class="card-media">
    ${picture(o.card, { sizes: "(max-width: 720px) 100vw, (max-width: 1080px) 50vw, 380px", alt: "" })}
  </div>
  <div class="card-body">
    <p class="venue-mini-place">${flag(o.country_iso2, 20, 15)}${esc(o.city)}, ${esc(o.country)}</p>
    <h3><a href="${o.url}" class="card-link">${esc(o.name)}</a></h3>
    <span class="post-card-more" aria-hidden="true">View Details ${ICON.arrow}</span>
  </div>
</article>`;
}

function jsonLd(v, baseUrl) {
  const text = String(v.description || "").replace(/<[^>]+>/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": v.category === "Hotels" || v.category === "Resorts" ? "Hotel" : "EventVenue",
    name: v.full_name || v.name,
    description: text.replace(/&amp;/g, "&"),
    url: baseUrl + v.url,
    image: (v.gallery || []).slice(0, 3).map((im) => baseUrl + largestUrl(im.media)),
    address: { "@type": "PostalAddress", addressLocality: v.city, addressCountry: v.country_iso2.toUpperCase() },
  }).replace(/</g, "\\u003c");
}

module.exports = { slide, card, filters, gallery, miniCard, jsonLd, proposalUrl, singular, ICON };
