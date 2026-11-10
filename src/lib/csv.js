"use strict";

// CSV for Excel: UTF-8 with a byte-order mark (so accents survive), CRLF line
// endings, and cells that start with = + - @ prefixed with ' so a malicious
// form entry cannot run as a spreadsheet formula when the file is opened.

function cell(value) {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString().replace("T", " ").slice(0, 19) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

function sendCsv(res, filename, headers, rows) {
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(headers, rows));
}

module.exports = { toCsv, sendCsv, cell };
