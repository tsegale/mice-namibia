"use strict";

// "Add to Calendar" files (RFC 5545), generated per request from the
// database instead of being written to disk.

const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

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

function conferenceIcs(c, baseUrl) {
  const url = baseUrl + c.url;
  const place = `${c.city}, ${c.country}`;
  const description = [c.excerpt, c.organiser ? `Organised by ${c.organiser}.` : "", url].filter(Boolean).join("\n\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zusammen Tours and Travel Agency//MICE Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${c.slug}@zusammentravels.com`,
    `DTSTAMP:${icsDate(c.updated_at || c.starts_at)}`,
    `DTSTART:${icsDate(c.starts_at)}`,
    `DTEND:${icsDate(c.ends_at)}`,
    `SUMMARY:${icsText(c.title)}`,
    `LOCATION:${icsText(place)}`,
    `DESCRIPTION:${icsText(description)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}

module.exports = { conferenceIcs };
