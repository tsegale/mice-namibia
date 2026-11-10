"use strict";

// Conference dates are stored in UTC and always shown in the conference's
// own IANA timezone, so a visitor in Berlin sees "08:30" for a Windhoek
// morning session, exactly as the static site did.

const cache = new Map();
function formatter(locale, tz, opts) {
  const key = `${locale}|${tz}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }));
  return cache.get(key);
}

const fmt = (d, tz, opts) => formatter("en-GB", tz, opts).format(new Date(d));
const fmtUS = (d, tz, opts) => formatter("en-US", tz, opts).format(new Date(d));

// "2027-01-08T08:30:00+02:00" for a UTC instant and a zone.
function isoInZone(date, tz) {
  const d = new Date(date);
  const parts = Object.fromEntries(
    formatter("en-US", tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMin = Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${off}`;
}

// Inverse: a local "2027-01-08T08:30" in a zone -> UTC Date (used by the admin form).
function zonedToUtc(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ""));
  if (!m) return null;
  const guess = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  // Two passes handle the offset (and any DST change near the date).
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const shown = isoInZone(utc, tz).slice(0, 16);
    const diff = new Date(`${shown}:00Z`).getTime() - guess.getTime();
    utc = new Date(utc.getTime() - diff);
  }
  return utc;
}

// "2027-01-08T08:30" (for <input type="datetime-local">) in a zone.
function localInputValue(date, tz) {
  return date ? isoInZone(date, tz).slice(0, 16) : "";
}

function validTimeZone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

module.exports = { fmt, fmtUS, isoInZone, zonedToUtc, localInputValue, validTimeZone };
