// Conference page generator (dev-only; the site itself stays plain static HTML).
//
// Source of truth: content/data/conferences.json
// Usage, from tools/:  node build-conferences.mjs
//
// Writes / updates:
//   ../event-<slug>.html          one detail page per conference
//   ../assets/calendar/<slug>.ics "Add to Calendar" file per conference
//   ../events.html                embedded JSON + server-rendered list view
//                                 (between the conferences:* markers)
//   ../index.html                 homepage conference cards (between markers)
//   ../contact.html               embedded JSON used to prefill the form
// Shared chrome (header, Let's Connect, newsletter, footer) is copied from
// events.html so detail pages always match the rest of the site.
// Run optimise-images.mjs on new conference images first.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);

const { site_url: SITE, conferences } = JSON.parse(await readFile(rel("content/data/conferences.json"), "utf8"));
const list = [...conferences].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Dates, always shown in the event's own timezone ----------------------------- */

const fmt = (iso, tz, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(new Date(iso));
const fmtUS = (iso, tz, opts) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(new Date(iso));
const time = (iso, tz) => fmt(iso, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateLong = (c) => fmtUS(c.starts_at, c.timezone, { month: "long", day: "numeric", year: "numeric" });
const weekdayLong = (c) => fmtUS(c.starts_at, c.timezone, { weekday: "long" });
const dow = (c) => fmtUS(c.starts_at, c.timezone, { weekday: "short" }).toUpperCase();
const dayNum = (c) => fmtUS(c.starts_at, c.timezone, { day: "numeric" });
const monthLabel = (c) => fmtUS(c.starts_at, c.timezone, { month: "long", year: "numeric" });
const timeRange = (c) => `${time(c.starts_at, c.timezone)} to ${time(c.ends_at, c.timezone)}`;
const tzNote = (c) => `local time, ${c.timezone.replace("_", " ")} (UTC${c.starts_at.slice(-6, -3)})`;

/* Images ------------------------------------------------------------------------ */

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function imageSet(src) {
  const base = src.replace(/\.(jpe?g|png)$/i, "");
  const v = [];
  for (const w of [640, 1280, 1920]) {
    if (await exists(rel(`${base}-${w}.jpg`))) {
      const m = await sharp(rel(`${base}-${w}.jpg`)).metadata();
      v.push({ w: m.width, h: m.height, jpg: `${base}-${w}.jpg`, webp: `${base}-${w}.webp` });
    }
  }
  if (!v.length) throw new Error(`No variants for ${src}. Run: node optimise-images.mjs ../${path.dirname(src)}`);
  const big = v[v.length - 1];
  return {
    src: (v.find((x) => x.w >= 1280) || big).jpg,
    large: big.jpg,
    srcset: v.map((x) => `${x.jpg} ${x.w}w`).join(", "),
    webpSrcset: v.map((x) => `${x.webp} ${x.w}w`).join(", "),
    width: big.w,
    height: big.h,
  };
}

function picture(set, { alt = "", sizes = "100vw", lazy = true, cls = "", indent = "" } = {}) {
  const load = lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"';
  return `${indent}<picture${cls ? ` class="${cls}"` : ""}>
${indent}  <source type="image/webp" srcset="${set.webpSrcset}" sizes="${sizes}">
${indent}  <img src="${set.src}" srcset="${set.srcset}" sizes="${sizes}" alt="${esc(alt)}" width="${set.width}" height="${set.height}"${load}>
${indent}</picture>`;
}

for (const c of list) {
  c.url = `event-${c.slug}.html`;
  c.coverSet = await imageSet(c.cover.src);
  c.gallerySets = await Promise.all(c.gallery.map((g) => imageSet(g.src)));
}

/* Icons --------------------------------------------------------------------------- */

const svg = (body, sw = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const ICON = {
  pin: svg('<path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  arrow: svg('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>', 2),
  download: svg('<path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M4 21h16"/>', 2),
  mail: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 6l10 7 10-7"/>'),
  zoom: svg('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>', 2),
};
// Brand share glyphs (Simple Icons, CC0), same set as the footer.
const SHARE_PATHS = {
  linkedin: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  whatsapp: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
};
const shareSvg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${SHARE_PATHS[k]}"/></svg>`;

/* Shared markup --------------------------------------------------------------------- */

const flag = (c, w = 24, h = 18) => `<img src="assets/images/flags/${c.country_iso2}.svg" alt="" width="${w}" height="${h}">`;
const place = (c) => `${c.city}, ${c.country}`;

// One list-view row. js/main.js renders the same markup client-side.
function eventRow(c) {
  return `          <article class="event-row">
            <div class="event-row-date" aria-hidden="true"><span class="event-row-dow">${dow(c)}</span><span class="event-row-day">${dayNum(c)}</span></div>
            <div class="event-row-body">
              <p class="event-row-when">${ICON.clock}<time datetime="${c.starts_at}">${dateLong(c)} @ ${timeRange(c)}</time></p>
              <h3 class="event-row-title"><a href="${c.url}">${esc(c.title)}</a></h3>
              <p class="event-row-where">${ICON.pin}${flag(c)}${place(c)}</p>
              <p class="event-row-excerpt">${esc(c.excerpt)}</p>
              <a href="${c.url}" class="text-link">Read More<span class="visually-hidden">: ${esc(c.short_title)}</span> ${ICON.arrow}</a>
            </div>
            <a href="${c.url}" class="event-row-media" tabindex="-1" aria-hidden="true">
${picture(c.coverSet, { sizes: "(max-width: 900px) 100vw, 360px", indent: "              " })}
            </a>
          </article>`;
}

function listHtml(items) {
  if (!items.length) return "";
  const groups = new Map();
  for (const c of items) {
    const k = monthLabel(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  return [...groups]
    .map(([month, cs]) => `        <div class="events-month">
          <h2 class="events-month-pill"><span>${month}</span></h2>
${cs.map(eventRow).join("\n")}
        </div>`)
    .join("\n");
}

// Data embedded in pages for the client-side views (no paths outside the site).
const embedded = JSON.stringify(
  list.map((c) => ({
    slug: c.slug, title: c.title, short_title: c.short_title, starts_at: c.starts_at, ends_at: c.ends_at,
    timezone: c.timezone, city: c.city, country: c.country, country_iso2: c.country_iso2, excerpt: c.excerpt,
    url: c.url, cover: { src: c.coverSet.src, srcset: c.coverSet.srcset, webp: c.coverSet.webpSrcset, width: c.coverSet.width, height: c.coverSet.height },
  })),
  null,
  0
).replace(/</g, "\\u003c");

function replaceBetween(html, name, content, file) {
  const re = new RegExp(`(<!-- conferences:${name}:start -->)[\\s\\S]*?(<!-- conferences:${name}:end -->)`);
  if (!re.test(html)) throw new Error(`${file}: missing conferences:${name} markers`);
  return html.replace(re, `$1\n${content}\n$2`);
}

/* Calendar files ---------------------------------------------------------------------- */

const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}
function ics(c) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Zusammen Tours and Travel Agency//MICE Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${c.slug}@zusammentravels.com`,
    `DTSTAMP:${icsDate(c.starts_at)}`,
    `DTSTART:${icsDate(c.starts_at)}`,
    `DTEND:${icsDate(c.ends_at)}`,
    `SUMMARY:${icsText(c.title)}`,
    `LOCATION:${icsText(place(c))}`,
    `DESCRIPTION:${icsText(`${c.excerpt}\n\nOrganised by ${c.organiser}.\n${SITE}${c.url}`)}`,
    `URL:${SITE}${c.url}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].map(fold).join("\r\n");
}

/* Detail page ------------------------------------------------------------------------------ */

function jsonLd(c) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Event",
    name: c.title,
    description: c.excerpt,
    startDate: c.starts_at,
    endDate: c.ends_at,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: place(c), address: { "@type": "PostalAddress", addressLocality: c.city, addressCountry: c.country_iso2.toUpperCase() } },
    image: [SITE + c.coverSet.large],
    organizer: { "@type": "Organization", name: c.organiser },
    url: SITE + c.url,
  }, null, 2).replace(/</g, "\\u003c");
}

function shareLinks(c) {
  const url = encodeURIComponent(SITE + c.url);
  const text = encodeURIComponent(`${c.short_title}: ${c.title}`);
  return [
    ["linkedin", "LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${url}`],
    ["x", "X", `https://x.com/intent/post?text=${text}&url=${url}`],
    ["whatsapp", "WhatsApp", `https://wa.me/?text=${text}%20${url}`],
  ].map(([k, label, href]) => `              <li><a href="${href}" class="share-link share-link--${k}" target="_blank" rel="noopener" aria-label="Share on ${label} (opens in a new tab)">${shareSvg(k)}</a></li>`)
    .concat(`              <li><a href="mailto:?subject=${text}&amp;body=${url}" class="share-link share-link--email" aria-label="Share by email">${ICON.mail}</a></li>`)
    .join("\n");
}

function moreCard(c) {
  return `          <article class="card conference-mini">
            <div class="card-media">
${picture(c.coverSet, { sizes: "(max-width: 720px) 100vw, 560px", indent: "              " })}
              <span class="date-badge" aria-hidden="true"><span>${dayNum(c)}</span>${fmtUS(c.starts_at, c.timezone, { month: "short" })}</span>
            </div>
            <div class="card-body">
              <p class="conference-mini-when">${ICON.clock}${dateLong(c)}, ${timeRange(c)}</p>
              <h3><a href="${c.url}" class="card-link">${esc(c.title)}</a></h3>
              <p class="conference-mini-where">${ICON.pin}${flag(c)}${place(c)}</p>
            </div>
          </article>`;
}

function detailMain(c) {
  const others = list.filter((o) => o.slug !== c.slug);
  const register = `contact.html?type=proposal&amp;event=${c.slug}#contact-form`;
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(c.city)},+${encodeURIComponent(c.country)}&amp;output=embed`;
  return `  <main id="main" tabindex="-1">

    <section class="page-header event-hero">
${picture(c.coverSet, { lazy: false, cls: "page-header-media", indent: "      " })}
      <div class="container">
        <nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="index.html">Home</a></li><li><a href="events.html">Events</a></li><li aria-current="page">${esc(c.short_title)}</li></ol></nav>
        <p class="eyebrow"><span class="stripe" aria-hidden="true"></span><span class="eyebrow-num">01</span>&nbsp;/ Conference</p>
        <p class="event-hero-when">${ICON.calendar}<time datetime="${c.starts_at}">${weekdayLong(c)}, ${dateLong(c)}</time><span aria-hidden="true">&middot;</span>${timeRange(c)}</p>
        <h1>${esc(c.title)}</h1>
        <p class="event-hero-where">${flag(c, 28, 21)}${place(c)}</p>
      </div>
    </section>

    <section class="section">
      <div class="container event-layout">
        <div class="event-main">

          <div class="countdown" data-countdown data-start="${c.starts_at}" data-end="${c.ends_at}" hidden>
            <p class="countdown-label" data-countdown-label>Starts in</p>
            <div class="countdown-units" data-countdown-units>
              <div class="countdown-unit"><span data-countdown-days>0</span><small>Days</small></div>
              <div class="countdown-unit"><span data-countdown-hours>0</span><small>Hours</small></div>
              <div class="countdown-unit"><span data-countdown-minutes>0</span><small>Minutes</small></div>
              <div class="countdown-unit"><span data-countdown-seconds>0</span><small>Seconds</small></div>
            </div>
            <p class="countdown-status" data-countdown-status hidden></p>
          </div>

          <div class="event-block" data-reveal>
            <p class="eyebrow"><span class="stripe" aria-hidden="true"></span><span class="eyebrow-num">02</span>&nbsp;/ About</p>
            <h2>About the <em class="accent">conference</em></h2>
${c.body.map((p) => `            <p>${esc(p)}</p>`).join("\n")}
          </div>

          <figure class="pull-quote" data-reveal>
            <span class="stripe" aria-hidden="true"></span>
            <blockquote><p>${esc(c.pull_quote)}</p></blockquote>
            <figcaption>${esc(c.short_title)}</figcaption>
          </figure>

          <div class="event-block" data-reveal>
            <p class="eyebrow"><span class="stripe" aria-hidden="true"></span><span class="eyebrow-num">03</span>&nbsp;/ Gallery</p>
            <h2>Gallery</h2>${c.images_are_stand_ins ? "\n            <!-- TODO: stand-in photos from the site's own library; replace with the client's\n                 images for this conference (see CLAUDE.md, \"Conferences\"). -->" : ""}
            <div class="event-gallery" data-lightbox>
${c.gallery.map((g, i) => `              <a href="${c.gallerySets[i].large}" class="event-gallery-item" data-lightbox-item data-caption="${esc(g.alt)}">
${picture(c.gallerySets[i], { alt: g.alt, sizes: i === 0 ? "(max-width: 720px) 100vw, 520px" : "(max-width: 720px) 100vw, 260px", indent: "                " })}
                <span class="event-gallery-zoom" aria-hidden="true">${ICON.zoom}</span>
              </a>`).join("\n")}
            </div>
          </div>

          <div class="event-block" data-reveal>
            <p class="eyebrow"><span class="stripe" aria-hidden="true"></span><span class="eyebrow-num">04</span>&nbsp;/ Location</p>
            <h2>Location</h2>
            <p class="event-location-line">${ICON.pin}${flag(c)}${place(c)}</p>
            <div class="event-map">
              <iframe src="${mapSrc}" title="Map of ${place(c)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
            </div>
          </div>

        </div>

        <aside class="event-aside" aria-labelledby="event-details-title">
          <div class="event-card">
            <h2 id="event-details-title">Event details</h2>
            <dl class="event-facts">
              <div><dt>${ICON.calendar}Date</dt><dd><time datetime="${c.starts_at}">${weekdayLong(c)}, ${dateLong(c)}</time></dd></div>
              <div><dt>${ICON.clock}Time</dt><dd>${timeRange(c)}<small>${tzNote(c)}</small></dd></div>
              <div><dt>${ICON.pin}Location</dt><dd class="event-facts-place">${flag(c)}${place(c)}</dd></div>
              <div><dt>${ICON.user}Organiser</dt><dd>${esc(c.organiser)}</dd></div>
            </dl>
            <div class="event-card-actions">
              <a href="${register}" class="btn btn-primary">Register Interest</a>
              <a href="assets/calendar/${c.slug}.ics" class="btn btn-outline" download>${ICON.download}Add to Calendar</a>
            </div>
            <p class="event-share-label" id="share-title">Share this event</p>
            <ul class="event-share" aria-labelledby="share-title">
${shareLinks(c)}
            </ul>
          </div>
        </aside>
      </div>
    </section>

    <section class="section section-alt">
      <div class="container">
        <div class="section-header">
          <p class="eyebrow"><span class="stripe" aria-hidden="true"></span><span class="eyebrow-num">05</span>&nbsp;/ Upcoming</p>
          <h2>More upcoming conferences</h2>
        </div>
        <div class="conference-mini-grid" data-reveal-stagger>
${others.map(moreCard).join("\n")}
        </div>
        <div class="services-cta"><a href="events.html" class="btn btn-outline">View all events</a></div>
      </div>
    </section>
`;
}

/* Homepage cards ---------------------------------------------------------------------------- */

// Horizontal card on the homepage's navy band (client's reference layout).
function homeCard(c) {
  return `          <article class="conference-row">
            <a href="${c.url}" class="conference-row-media" tabindex="-1" aria-hidden="true">
${picture(c.coverSet, { sizes: "(max-width: 720px) 100vw, 320px", indent: "              " })}
              <span class="date-badge"><span>${dayNum(c)}</span>${fmtUS(c.starts_at, c.timezone, { month: "short" })}</span>
            </a>
            <div class="conference-row-body">
              <p class="conference-row-when">${ICON.clock}<span>${timeRange(c)}</span><span class="conference-row-date">${weekdayLong(c)}, ${dateLong(c)}</span></p>
              <h3><a href="${c.url}">${esc(c.title)}</a></h3>
              <p class="conference-row-excerpt">${esc(c.excerpt)}</p>
              <p class="conference-row-where">${ICON.pin}${flag(c)}${place(c)}</p>
            </div>
            <div class="conference-row-action">
              <a href="${c.url}" class="btn btn-primary">Read More<span class="visually-hidden">: ${esc(c.short_title)}</span></a>
            </div>
          </article>`;
}

// Shown on the homepage when nothing is upcoming.
const HOME_EMPTY = `          <div class="conference-empty">
            <p class="conference-empty-title">New conferences are being confirmed</p>
            <p>Get the alerts and be the first to hear when the next one is announced.</p>
            <a href="#newsletter" class="btn btn-primary">Get event alerts</a>
          </div>`;

/* Write everything -------------------------------------------------------------------------------- */

let events = await readFile(rel("events.html"), "utf8");
const chromeTop = events.slice(events.indexOf("<body>"), events.indexOf('  <main id="main"'));
const chromeBottom = events.slice(events.indexOf("    <!-- Let's Connect (shared"));
const headAssets = events.slice(events.indexOf('  <link rel="preload"'), events.indexOf("</head>"));

await mkdir(rel("assets/calendar"), { recursive: true });
for (const c of list) {
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(c.short_title)} | ${esc(c.city)} | MICE Namibia</title>
  <meta name="description" content="${esc(c.excerpt)}">
  <link rel="canonical" href="${SITE}${c.url}">
${headAssets}  <script type="application/ld+json">
${jsonLd(c)}
  </script>
</head>
${chromeTop}${detailMain(c)}
${chromeBottom}`;
  await writeFile(rel(c.url), page);
  await writeFile(rel(`assets/calendar/${c.slug}.ics`), ics(c));
  console.log("wrote", c.url, `assets/calendar/${c.slug}.ics`);
}

const upcoming = list.filter((c) => c.status === "upcoming");
events = replaceBetween(events, "data", `  <script type="application/json" id="conference-data">${embedded}</script>`, "events.html");
events = replaceBetween(events, "list", listHtml(upcoming), "events.html");
await writeFile(rel("events.html"), events);
console.log("updated events.html");

let home = await readFile(rel("index.html"), "utf8");
home = replaceBetween(home, "home", upcoming.length ? upcoming.slice(0, 3).map(homeCard).join("\n") : HOME_EMPTY, "index.html");
// Keep the hero's "Upcoming conferences" stat in step with the data.
home = home.replace(/data-count-to="\d+" data-conference-count>\d+</, `data-count-to="${upcoming.length}" data-conference-count>${upcoming.length}<`);
await writeFile(rel("index.html"), home);
console.log("updated index.html");

let contact = await readFile(rel("contact.html"), "utf8");
contact = replaceBetween(contact, "data", `  <script type="application/json" id="conference-data">${embedded}</script>`, "contact.html");
await writeFile(rel("contact.html"), contact);
console.log("updated contact.html");
