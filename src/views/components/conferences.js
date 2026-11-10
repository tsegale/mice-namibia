"use strict";

// Conference markup shared by the homepage, Events archive, event pages,
// Pricing and Contact. Ported 1:1 from the reviewed static generator
// (tools/build-conferences.mjs), now fed from the database.

const { escapeHtml: esc } = require("../../lib/text");
const { picture, imageUrl, largestUrl, widthsOf, variantUrl } = require("../../lib/picture");
const { fmt, fmtUS } = require("../../lib/dates");
const { CONF: ICON, shareSvg, flag: flagImg } = require("./icons");

const time = (d, tz) => fmt(d, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateLong = (c) => fmtUS(c.starts_at, c.timezone, { month: "long", day: "numeric", year: "numeric" });
const weekdayLong = (c) => fmtUS(c.starts_at, c.timezone, { weekday: "long" });
const dow = (c) => fmtUS(c.starts_at, c.timezone, { weekday: "short" }).toUpperCase();
const dayNum = (c) => fmtUS(c.starts_at, c.timezone, { day: "numeric" });
const monthShort = (c) => fmtUS(c.starts_at, c.timezone, { month: "short" });
const monthLabel = (c) => fmtUS(c.starts_at, c.timezone, { month: "long", year: "numeric" });
const timeRange = (c) => `${time(c.starts_at, c.timezone)} to ${time(c.ends_at, c.timezone)}`;
const tzNote = (c) => `local time, ${c.timezone.replace("_", " ")} (UTC${c.starts_iso.slice(-6, -3)})`;
const flag = (c, w, h) => flagImg(c.country_iso2, w, h);
const place = (c) => `${esc(c.city)}, ${esc(c.country)}`;

function eventRow(c) {
  return `<article class="event-row">
  <div class="event-row-date" aria-hidden="true"><span class="event-row-dow">${dow(c)}</span><span class="event-row-day">${dayNum(c)}</span></div>
  <div class="event-row-body">
    <p class="event-row-when">${ICON.clock}<time datetime="${c.starts_iso}">${dateLong(c)} @ ${timeRange(c)}</time></p>
    <h3 class="event-row-title"><a href="${c.url}">${esc(c.title)}</a></h3>
    <p class="event-row-where">${ICON.pin}${flag(c)}${place(c)}</p>
    <p class="event-row-excerpt">${esc(c.excerpt)}</p>
    <a href="${c.url}" class="text-link">Read More<span class="visually-hidden">: ${esc(c.short_title)}</span> ${ICON.arrow}</a>
  </div>
  <a href="${c.url}" class="event-row-media" tabindex="-1" aria-hidden="true">
    ${picture(c.cover, { sizes: "(max-width: 900px) 100vw, 360px" })}
  </a>
</article>`;
}

function list(items) {
  const groups = new Map();
  for (const c of items) {
    const k = monthLabel(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  return [...groups]
    .map(([month, cs]) => `<div class="events-month">
  <h2 class="events-month-pill"><span>${month}</span></h2>
${cs.map(eventRow).join("\n")}
</div>`)
    .join("\n");
}

// Data for the client-side Month/Day views and the contact form prefill.
function embeddedJson(items) {
  return JSON.stringify(
    items.map((c) => {
      const m = c.cover;
      const widths = m ? widthsOf(m) : [];
      return {
        slug: c.slug,
        title: c.title,
        short_title: c.short_title,
        starts_at: c.starts_iso,
        ends_at: c.ends_iso,
        timezone: c.timezone,
        city: c.city,
        country: c.country,
        country_iso2: c.country_iso2,
        excerpt: c.excerpt,
        url: c.url,
        cover: m
          ? {
              src: imageUrl(m),
              srcset: widths.map((w) => `${variantUrl(m, w, "jpg")} ${w}w`).join(", "),
              webp: widths.map((w) => `${variantUrl(m, w, "webp")} ${w}w`).join(", "),
              width: m.width,
              height: m.height,
            }
          : null,
      };
    })
  ).replace(/</g, "\\u003c");
}

function homeCard(c) {
  return `<article class="conference-row">
  <a href="${c.url}" class="conference-row-media" tabindex="-1" aria-hidden="true">
    ${picture(c.cover, { sizes: "(max-width: 720px) 100vw, 320px" })}
    <span class="date-badge"><span>${dayNum(c)}</span>${monthShort(c)}</span>
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

const HOME_EMPTY = `<div class="conference-empty">
  <p class="conference-empty-title">New conferences are being confirmed</p>
  <p>Get the alerts and be the first to hear when the next one is announced.</p>
  <a href="#newsletter" class="btn btn-primary">Get event alerts</a>
</div>`;

function home(items) {
  return items.length ? items.slice(0, 3).map(homeCard).join("\n") : HOME_EMPTY;
}

function pricingPicker(items) {
  if (!items.length) {
    return `<div class="conference-empty">
  <p class="conference-empty-title">New conferences are being confirmed</p>
  <p>Ticket plans open as soon as the next conference is announced.</p>
  <a href="#newsletter" class="btn btn-primary">Get event alerts</a>
</div>`;
  }
  const opts = items
    .map(
      (c, i) => `<label class="ticket-option">
  <input type="radio" name="ticket-conference" value="${c.slug}" data-title="${esc(c.short_title)}"${i === 0 ? " checked" : ""}>
  <span class="ticket-option-card">
    ${picture(c.cover, { sizes: "120px" })}
    <span class="ticket-option-body">
      <span class="ticket-option-date">${fmtUS(c.starts_at, c.timezone, { day: "numeric", month: "short", year: "numeric" })}</span>
      <span class="ticket-option-title">${esc(c.short_title)}</span>
      <span class="ticket-option-place">${flag(c, 20, 15)}${place(c)}</span>
    </span>
  </span>
</label>`
    )
    .join("\n");
  return `<fieldset class="ticket-picker" data-ticket-picker>
  <legend>Tickets for</legend>
  <div class="ticket-options">
${opts}
  </div>
</fieldset>`;
}

function shareLinks(c, baseUrl) {
  const url = encodeURIComponent(baseUrl + c.url);
  const text = encodeURIComponent(`${c.short_title}: ${c.title}`);
  return [
    ["linkedin", "LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${url}`],
    ["x", "X", `https://x.com/intent/post?text=${text}&amp;url=${url}`],
    ["whatsapp", "WhatsApp", `https://wa.me/?text=${text}%20${url}`],
  ]
    .map(([k, label, href]) => `<li><a href="${href}" class="share-link share-link--${k}" target="_blank" rel="noopener" aria-label="Share on ${label} (opens in a new tab)">${shareSvg(k)}</a></li>`)
    .concat(`<li><a href="mailto:?subject=${text}&amp;body=${url}" class="share-link share-link--email" aria-label="Share by email">${ICON.mail}</a></li>`)
    .join("\n");
}

function moreCard(c) {
  return `<article class="card conference-mini">
  <div class="card-media">
    ${picture(c.cover, { sizes: "(max-width: 720px) 100vw, 560px" })}
    <span class="date-badge" aria-hidden="true"><span>${dayNum(c)}</span>${monthShort(c)}</span>
  </div>
  <div class="card-body">
    <p class="conference-mini-when">${ICON.clock}${dateLong(c)}, ${timeRange(c)}</p>
    <h3><a href="${c.url}" class="card-link">${esc(c.title)}</a></h3>
    <p class="conference-mini-where">${ICON.pin}${flag(c)}${place(c)}</p>
  </div>
</article>`;
}

function jsonLd(c, baseUrl) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Event",
    name: c.title,
    description: c.excerpt,
    startDate: c.starts_iso,
    endDate: c.ends_iso,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: `${c.city}, ${c.country}`, address: { "@type": "PostalAddress", addressLocality: c.city, addressCountry: c.country_iso2.toUpperCase() } },
    image: c.cover ? [baseUrl + largestUrl(c.cover)] : [],
    organizer: { "@type": "Organization", name: c.organiser },
    url: baseUrl + c.url,
  }).replace(/</g, "\\u003c");
}

module.exports = { eventRow, list, embeddedJson, home, homeCard, pricingPicker, shareLinks, moreCard, jsonLd, helpers: { dateLong, weekdayLong, timeRange, tzNote, dayNum, monthShort, place, flag } };
