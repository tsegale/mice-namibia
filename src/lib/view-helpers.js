"use strict";

const { picture, imageUrl, largestUrl } = require("./picture");
const { escapeHtml } = require("./text");

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Windhoek" });
const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Africa/Windhoek",
});

function formatDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : DATE_FMT.format(d);
}

function formatDateTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : DATETIME_FMT.format(d).replace(",", "");
}

function timeAgo(value) {
  if (!value) return "";
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : formatDate(value);
}

// Numbers written out in page copy ("across nine African destinations").
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
function numberWord(n, { capital = false } = {}) {
  const word = Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

module.exports = { picture, imageUrl, largestUrl, escapeHtml, formatDate, formatDateTime, timeAgo, numberWord };
