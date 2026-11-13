"use strict";

// Renders the client's legal markdown (content/legal/*.md and every version
// published in the admin) into the legal page body. It understands exactly
// what those documents use, and nothing that could inject markup:
//
//   # Title                      the page title (not part of the body)
//   **Effective Date: <date>**   the effective-date badge (not part of the body)
//   ## 3. Heading                <h2 id="section-3">, listed in the contents
//   paragraphs                   a single line break inside one becomes <br>
//   - item / 1. item             <ul> / <ol>
//   **bold**                     <strong>; bold text that is another legal
//                                document's title links to it
//   emails, +264 phone numbers   mailto: / tel: links
//
// Everything else is text: < > & are escaped. The output is indented to sit
// inside <article class="legal-body">, matching the reviewed static pages.

const IND = "      ";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s) => esc(s).replace(/"/g, "&quot;");

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const PHONE = /\+\d{1,3}(?: \d{2,4}){2,4}/g;

// Links inside one run of (already escaped) text.
function linkify(text) {
  return text
    .replace(EMAIL, (m) => `<a href="mailto:${attr(m)}">${m}</a>`)
    .replace(PHONE, (m) => `<a href="tel:${m.replace(/ /g, "")}">${m}</a>`);
}

function inline(src, links) {
  return String(src)
    .split(/(\*\*[^*]+\*\*)/)
    .map((part) => {
      const bold = /^\*\*([^*]+)\*\*$/.exec(part);
      if (!bold) return linkify(esc(part));
      const text = bold[1];
      const href = links[text];
      return `<strong>${href ? `<a href="${attr(href)}">${esc(text)}</a>` : linkify(esc(text))}</strong>`;
    })
    .join("");
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "01 January 2027" -> "2027-01-01", or null.
function parseEffective(text) {
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(String(text).trim());
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  if (month < 0) return null;
  const iso = `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return d.getUTCMonth() === month && d.getUTCDate() === Number(m[1]) ? iso : null;
}

// "2027-01-01" (or a Date) -> "01 January 2027", the form the badge uses.
function formatEffective(value) {
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const [y, mo, d] = iso.split("-");
  return `${d} ${MONTHS[Number(mo) - 1]} ${y}`;
}

// links: { "Privacy Policy": "/privacy-policy" } for cross-references.
function render(markdown, { links = {} } = {}) {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const sections = [];
  let title = null;
  let effective = null;
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) blocks.push(`${IND}<p>${para.map((l) => inline(l, links)).join(`<br>\n${IND}`)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(`${IND}<${list.tag}>\n${list.items.map((i) => `${IND}  <li>${inline(i, links)}</li>`).join("\n")}\n${IND}</${list.tag}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    let m;
    if ((m = /^# (.+)$/.exec(line)) && title === null && !blocks.length) {
      title = m[1].trim();
      continue;
    }
    if ((m = /^\*\*Effective Date:\s*(.+?)\*\*$/.exec(line)) && effective === null && !sections.length) {
      flushPara();
      effective = { text: m[1].trim(), iso: parseEffective(m[1]) };
      continue;
    }
    if ((m = /^#{2,6} (.+)$/.exec(line))) {
      flushPara();
      flushList();
      const text = m[1].trim();
      const num = /^(\d+)\.\s/.exec(text);
      const id = num ? `section-${num[1]}` : `section-${sections.length + 1}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      // html: the heading as markup (escaped like the body), for the contents.
      sections.push({ id, text, html: inline(text, links) });
      blocks.push(`${IND}<h2 id="${attr(id)}">${inline(text, links)}</h2>`);
      continue;
    }
    if ((m = /^\s*[-*] (.+)$/.exec(line)) || (m = /^\s*\d+\. (.+)$/.exec(line))) {
      const tag = /^\s*\d+\. /.test(line) ? "ol" : "ul";
      flushPara();
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(m[1].trim());
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return { title, effective, sections, html: blocks.join("\n\n") };
}

module.exports = { render, parseEffective, formatEffective };
