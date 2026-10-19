// Builds the Venues listing and the four venue pages from content/data/venues.json
// (client spec 06: Venue Category / Filter by Country / Product Categories
// filters, two-column cards with the country where the theme showed a price,
// "View Details", and a 10-image auto-rolling gallery on each venue page).
//
// Usage, from tools/:  node build-venues.mjs
//
// Writes (never edit these regions by hand):
//   ../venues.html          everything inside <main> after the page header
//   ../venue-<slug>.html    everything inside <main>, plus <!-- venue:jsonld --> in <head>
// Gallery images: <gallery_dir>/gallery-01.jpg .. gallery-10.jpg with -640/-1280/-1920
// variants from optimise-images.mjs. No dependencies.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => path.join(ROOT, p);
const data = JSON.parse(await readFile(rel("content/data/venues.json"), "utf8"));
const SITE = data.site_url;
const COUNTRY = Object.fromEntries(data.countries);
const venues = data.venues;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function jpegSize(file) {
  const b = readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error("no size: " + file);
}

function picture(base, { sizes, alt = "", lazy = true, priority = false, indent = "" }) {
  const ws = [640, 1280, 1920].filter((w) => existsSync(rel(`${base}-${w}.jpg`)));
  if (!ws.length) throw new Error("no variants for " + base);
  const fw = ws.includes(1280) ? 1280 : ws[ws.length - 1];
  const [w, h] = jpegSize(rel(`${base}-${fw}.jpg`));
  const extra = lazy ? ' loading="lazy" decoding="async"' : priority ? ' fetchpriority="high"' : "";
  return `${indent}<picture>
${indent}  <source type="image/webp" srcset="${ws.map((x) => `${base}-${x}.webp ${x}w`).join(", ")}" sizes="${sizes}">
${indent}  <img src="${base}-${fw}.jpg" srcset="${ws.map((x) => `${base}-${x}.jpg ${x}w`).join(", ")}" sizes="${sizes}" alt="${esc(alt)}" width="${w}" height="${h}"${extra}>
${indent}</picture>`;
}

const ICON = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="15 18 9 12 15 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="9 18 15 12 9 6"/></svg>',
  pause: '<svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg><svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
};

const flag = (iso, w = 24, h = 18) => `<img src="assets/images/flags/${iso}.svg" alt="" width="${w}" height="${h}">`;
const proposalUrl = (v) => `contact.html?type=proposal&amp;venue=${encodeURIComponent(v.name)}&amp;destination=${encodeURIComponent(COUNTRY[v.country_iso2])}#contact-form`;

/* Listing --------------------------------------------------------------------- */

function card(v, i) {
  return `            <article class="venue-card-lg" data-venue data-category="${esc(v.category)}" data-country="${v.country_iso2}" data-tags="${esc(v.tags.join("|"))}" data-name="${esc(v.name)}" data-order="${i}">
              <div class="venue-card-lg-media">
${picture(v.card_image, { sizes: "(max-width: 900px) 100vw, 440px", alt: v.gallery[0], indent: "                " })}
                <span class="chip chip--category">${esc(v.category.replace(/s$/, "").replace(/Centre$/, "Centre"))}</span>
              </div>
              <div class="venue-card-lg-body">
                <h3><a href="${v.file}" class="card-link">${esc(v.name)}</a></h3>
                <p class="venue-card-lg-country">${flag(v.country_iso2)}<span>${esc(v.city)}, ${esc(COUNTRY[v.country_iso2])}</span></p>
                <span class="btn btn-secondary venue-card-lg-btn" aria-hidden="true">View Details</span>
              </div>
            </article>`;
}

const count = (fn) => venues.filter(fn).length;
const usedTags = [...new Set(venues.flatMap((v) => v.tags))].sort();

const filters = `          <aside class="venue-filters" aria-label="Filter venues">
            <div class="venue-filter">
              <h2 class="venue-filter-title" id="vf-category">Venue Category</h2>
              <ul aria-labelledby="vf-category">
                <li><button type="button" class="venue-filter-opt is-active" data-filter="category" data-value="" aria-pressed="true">All categories <span>${venues.length}</span></button></li>
${data.venue_categories.filter((c) => count((v) => v.category === c)).map((c) => `                <li><button type="button" class="venue-filter-opt" data-filter="category" data-value="${esc(c)}" aria-pressed="false">${esc(c)} <span>${count((v) => v.category === c)}</span></button></li>`).join("\n")}
              </ul>
            </div>
            <div class="venue-filter">
              <h2 class="venue-filter-title" id="vf-country">Filter by Country</h2>
              <ul aria-labelledby="vf-country">
                <li><button type="button" class="venue-filter-opt is-active" data-filter="country" data-value="" aria-pressed="true">All countries <span>${venues.length}</span></button></li>
${data.countries.map(([iso, name]) => { const n = count((v) => v.country_iso2 === iso); return `                <li><button type="button" class="venue-filter-opt" data-filter="country" data-value="${iso}" aria-pressed="false"${n ? "" : " disabled"}>${flag(iso, 20, 15)}${esc(name)} <span>${n}</span></button></li>`; }).join("\n")}
              </ul>
            </div>
            <div class="venue-filter">
              <h2 class="venue-filter-title" id="vf-tags">Product Categories</h2>
              <ul class="venue-tag-list" aria-labelledby="vf-tags">
${usedTags.map((t) => `                <li><button type="button" class="venue-tag" data-filter="tag" data-value="${esc(t)}" aria-pressed="false">${esc(t)}</button></li>`).join("\n")}
              </ul>
            </div>
          </aside>`;

const listing = `    <section class="section" aria-labelledby="venues-intro-title">
      <div class="container">
        <div class="venues-intro">
          <div>
            <p class="eyebrow"><span class="stripe" aria-hidden="true"></span><span class="eyebrow-num">02</span>&nbsp;/ Our venues</p>
            <h2 id="venues-intro-title">Discover Spaces That Bring Events to <em class="accent">Life</em></h2>
          </div>
          <p>Every successful event starts with the right venue. As part of Zusammen Tours and Travel Agency's MICE segment, we offer a carefully selected collection of conference centres, meeting rooms, exhibition venues, hotels and distinctive event spaces to suit a wide range of business events and occasions. Whether you're organising a corporate meeting, incentive trip, conference, exhibition or gala dinner, our venue listings make it easy to find the ideal setting. Discover spaces that inspire collaboration, create lasting impressions and provide the perfect backdrop for successful events across Namibia.</p>
        </div>
        <div class="venues-layout" data-venue-filters>
${filters}
          <div class="venues-results">
            <div class="venues-toolbar">
              <p class="venues-count" aria-live="polite" data-venue-count>Showing all ${venues.length} results</p>
              <label class="venues-sort">
                <span class="visually-hidden">Sort venues</span>
                <select data-venue-sort>
                  <option value="default">Default sorting</option>
                  <option value="name">Sort by name</option>
                  <option value="country">Sort by country</option>
                </select>
              </label>
            </div>
            <div class="venue-grid-lg" data-venue-list>
${venues.map(card).join("\n")}
            </div>
            <div class="venues-empty" data-venue-empty hidden>
              <p><strong>No venues match these filters yet.</strong> We add venues across all nine destinations regularly, and we can source one for you.</p>
              <div class="venues-empty-actions">
                <button type="button" class="btn btn-ghost" data-venue-reset>Clear filters</button>
                <a href="contact.html?type=proposal#contact-form" class="btn btn-primary">Ask us to source a venue</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>`;

let list = await readFile(rel("venues.html"), "utf8");
{
  const mainStart = list.indexOf('<section class="page-header');
  const afterHeader = list.indexOf("</section>", mainStart) + "</section>".length;
  const band = list.indexOf("    <!-- Let's Connect (shared");
  list = list.slice(0, afterHeader) + "\n\n" + listing + "\n\n" + list.slice(band);
  // Spec: the slogan sits beneath the heading.
  list = list.replace(/(<h1>Venues<\/h1>)\s*(<p class="page-subtitle">[^<]*<\/p>)?/, '$1\n        <p class="page-subtitle">Discover Spaces That Bring Events to Life</p>');
}
await writeFile(rel("venues.html"), list);
console.log("updated venues.html");

/* Venue pages ------------------------------------------------------------------ */

for (const v of venues) {
  const file = v.file;
  let html = await readFile(rel(file), "utf8");
  const g = v.gallery.map((alt, i) => ({ base: `${v.gallery_dir}/gallery-${String(i + 1).padStart(2, "0")}`, alt }));
  const others = venues.filter((o) => o !== v);
  const country = COUNTRY[v.country_iso2];

  const main = `
    <section class="page-header">
${picture(g[0].base, { sizes: "100vw", alt: "", lazy: false, priority: true, indent: "      " }).replace("<picture>", '<picture class="page-header-media">')}
      <div class="container">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="index.html">Home</a></li><li><a href="venues.html">Venues</a></li><li aria-current="page">${esc(v.name)}</li></ol></nav>
        <p class="eyebrow"><span class="stripe" aria-hidden="true"></span><span class="eyebrow-num">01</span>&nbsp;/ Venues</p>
        <h1>${esc(v.name)}</h1>
        <p class="page-subtitle venue-hero-place">${flag(v.country_iso2)}${esc(v.city)}, ${esc(country)}</p>
      </div>
    </section>

    <section class="section">
      <div class="container venue-detail-grid">
        <div class="venue-gallery" data-venue-gallery data-lightbox aria-roledescription="carousel" aria-label="${esc(v.name)} photo gallery">
          <div class="venue-gallery-stage">
${g.map((im, i) => `            <a href="${im.base}-1920.jpg" class="venue-gallery-slide${i === 0 ? " is-active" : ""}" data-venue-slide data-lightbox-item data-caption="${esc(im.alt)}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${g.length}: ${esc(im.alt)}"${i === 0 ? "" : ' aria-hidden="true" tabindex="-1"'}>
${picture(im.base, { sizes: "(max-width: 1080px) 100vw, 680px", alt: im.alt, lazy: i !== 0, indent: "              " })}
            </a>`).join("\n")}
            <button type="button" class="venue-gallery-nav venue-gallery-nav--prev" data-venue-prev aria-label="Previous photo">${ICON.prev}</button>
            <button type="button" class="venue-gallery-nav venue-gallery-nav--next" data-venue-next aria-label="Next photo">${ICON.next}</button>
            <div class="venue-gallery-bar">
              <span class="venue-gallery-counter" data-venue-counter aria-live="polite">1 / ${g.length}</span>
              <span class="venue-gallery-hint">${ICON.expand}Click to enlarge</span>
              <button type="button" class="venue-gallery-pause" data-venue-pause aria-label="Pause slideshow" aria-pressed="false">${ICON.pause}</button>
            </div>
          </div>
          <div class="venue-gallery-thumbs" role="group" aria-label="Choose a photo">
${g.map((im, i) => `            <button type="button" class="venue-gallery-thumb${i === 0 ? " is-active" : ""}" data-venue-thumb="${i}" aria-label="Show photo ${i + 1}: ${esc(im.alt)}"${i === 0 ? ' aria-current="true"' : ""}>
${picture(im.base, { sizes: "120px", alt: "", indent: "              " })}
            </button>`).join("\n")}
          </div>
        </div>

        <div class="venue-summary">
          <p class="venue-country">${flag(v.country_iso2, 32, 24)}<span>${esc(country)}</span></p>
          <h2 class="venue-summary-title">${esc(v.full_name)}</h2>
          <p class="venue-summary-place">${ICON.pin}${esc(v.city)}, ${esc(country)}</p>
          <div class="venue-description">
${v.description.map((p) => `            <p>${esc(p)}</p>`).join("\n")}
          </div>
          <a href="${proposalUrl(v)}" class="btn btn-primary btn-xl">Request a Proposal ${ICON.arrow}</a>
          <p class="venue-summary-note">Tell us your dates and delegate numbers and we will come back with availability and a tailor-made proposal for ${esc(v.name)}.</p>
        </div>
      </div>
    </section>

    <section class="section section--sand venue-location" aria-labelledby="venue-map-title">
      <div class="container venue-location-grid">
        <div>
          <p class="eyebrow"><span class="stripe" aria-hidden="true"></span><span class="eyebrow-num">02</span>&nbsp;/ Location</p>
          <h2 id="venue-map-title">Where you will <em class="accent">meet</em></h2>
          <p class="venue-location-place">${flag(v.country_iso2)}${esc(v.full_name)}, ${esc(v.city)}, ${esc(country)}</p>
          <a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(v.map_query)}" class="text-link" target="_blank" rel="noopener">Open in Google Maps ${ICON.arrow}</a>
        </div>
        <div class="venue-map">
          <iframe src="https://www.google.com/maps?q=${encodeURIComponent(v.map_query)}&amp;output=embed" title="Map showing ${esc(v.full_name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="other-venues-title">
      <div class="container">
        <div class="home-venues-head">
          <div>
            <p class="eyebrow"><span class="stripe" aria-hidden="true"></span><span class="eyebrow-num">03</span>&nbsp;/ More venues</p>
            <h2 id="other-venues-title">Other <em class="accent">venues</em></h2>
          </div>
          <a href="venues.html" class="text-link">All venues ${ICON.arrow}</a>
        </div>
        <div class="venue-mini-grid venue-mini-grid--3">
${others.map((o) => `          <article class="card venue-mini">
            <div class="card-media">
${picture(o.card_image, { sizes: "(max-width: 720px) 100vw, (max-width: 1080px) 50vw, 380px", alt: "", indent: "              " })}
            </div>
            <div class="card-body">
              <p class="venue-mini-place">${flag(o.country_iso2, 20, 15)}${esc(o.city)}, ${esc(COUNTRY[o.country_iso2])}</p>
              <h3><a href="${o.file}" class="card-link">${esc(o.name)}</a></h3>
              <span class="post-card-more" aria-hidden="true">View Details ${ICON.arrow}</span>
            </div>
          </article>`).join("\n")}
        </div>
      </div>
    </section>

`;
  const a = html.indexOf('<main id="main" tabindex="-1">') + '<main id="main" tabindex="-1">'.length;
  const b = html.indexOf("    <!-- Let's Connect (shared");
  html = html.slice(0, a) + "\n" + main + html.slice(b);

  if (!html.includes("<!-- venue:jsonld:start -->")) html = html.replace("</head>", "  <!-- venue:jsonld:start -->\n  <!-- venue:jsonld:end -->\n</head>");
  const ld = {
    "@context": "https://schema.org",
    "@type": v.category === "Hotels" || v.category === "Resorts" ? "Hotel" : "EventVenue",
    name: v.full_name,
    description: v.description[0],
    url: `${SITE}${file}`,
    image: g.slice(0, 3).map((im) => `${SITE}${im.base}-1280.jpg`),
    address: { "@type": "PostalAddress", addressLocality: v.city, addressCountry: v.country_iso2.toUpperCase() },
  };
  html = html.replace(/<!-- venue:jsonld:start -->[\s\S]*?<!-- venue:jsonld:end -->/, `<!-- venue:jsonld:start -->\n  <script type="application/ld+json">${JSON.stringify(ld)}</script>\n  <!-- venue:jsonld:end -->`);
  await writeFile(rel(file), html);
  console.log("wrote", file);
}
