"use strict";

// The Privacy Policy and Terms and Conditions: versioned markdown, rendered
// by lib/legal-markdown.js. Publishing adds a version and makes it current;
// there is deliberately no function here (or anywhere) that updates or
// deletes a version.

const { db } = require("../db/knex");
const { render, formatEffective } = require("../lib/legal-markdown");
const { diffHtml } = require("../lib/word-diff");
const { ValidationError } = require("../validation/common");

// Page details that are not part of the legal text: the header photo and
// the contact card heading, as on the reviewed static pages.
const PAGES = {
  "privacy-policy": {
    file: "privacy-policy.md",
    header: { base: "/assets/images/venues/the-westin-cape-town/spa", widths: [640, 1280], width: 1280, height: 720 },
    contactHeading: "Questions about this policy? Contact us",
  },
  "terms-and-conditions": {
    file: "terms-and-conditions.md",
    header: { base: "/assets/images/venues/movenpick/poolside", widths: [640, 1280], width: 1280, height: 1920 },
    contactHeading: "Questions about these terms? Contact us",
  },
};
const SLUGS = Object.keys(PAGES);
const MAX_MARKDOWN = 400 * 1024;

async function documents() {
  return db()("legal_documents").whereIn("slug", SLUGS).orderBy("id");
}

async function bySlug(slug) {
  if (!PAGES[slug]) return null;
  return db()("legal_documents").where({ slug }).first();
}

// Bold text naming another legal document links to it.
async function linksFor(slug) {
  return Object.fromEntries((await documents()).filter((d) => d.slug !== slug).map((d) => [d.title, `/${d.slug}`]));
}

const versionsOf = (documentId) => db()("legal_document_versions").where({ document_id: documentId }).orderBy("version_number", "desc");

// Everything a public legal page needs for one version (the current one by
// default, or version `number`).
async function page(slug, number = null) {
  const doc = await bySlug(slug);
  if (!doc || !doc.current_version_id) return null;
  const versions = await versionsOf(doc.id).select("id", "version_number", "effective_date", "published_at");
  const version = number == null ? await db()("legal_document_versions").where({ id: doc.current_version_id }).first() : await db()("legal_document_versions").where({ document_id: doc.id, version_number: number }).first();
  if (!version) return null;
  const rendered = render(version.markdown, { links: await linksFor(slug) });
  const isCurrent = version.id === doc.current_version_id;
  // A previous version was in force until the next one took effect.
  const next = versions.filter((v) => v.version_number > version.version_number).at(-1);
  return {
    doc,
    version,
    isCurrent,
    effective: formatEffective(version.effective_date),
    until: !isCurrent && next ? formatEffective(next.effective_date) : null,
    sections: rendered.sections,
    html: rendered.html,
    versions: versions.map((v) => ({ ...v, effective: formatEffective(v.effective_date), isCurrent: v.id === doc.current_version_id })),
    ...PAGES[slug],
  };
}

// Checks a proposed version's markdown; returns the rendering.
async function check(slug, markdown) {
  const text = String(markdown ?? "").replace(/\r\n?/g, "\n");
  if (!text.trim()) throw new ValidationError({ markdown: "Paste the document's markdown or upload the .md file." });
  if (Buffer.byteLength(text) > MAX_MARKDOWN) throw new ValidationError({ markdown: "The document is larger than 400 KB. Check that the right file was chosen." });
  const rendered = render(text, { links: await linksFor(slug) });
  if (!rendered.sections.length) throw new ValidationError({ markdown: 'No headings found. Each section starts with a line like "## 1. Information We Collect".' });
  return { text, rendered };
}

// Preview and word-level diff against the current version.
async function preview(slug, markdown) {
  const doc = await bySlug(slug);
  if (!doc) return null;
  const { text, rendered } = await check(slug, markdown);
  const current = doc.current_version_id ? await db()("legal_document_versions").where({ id: doc.current_version_id }).first() : null;
  return { rendered, diff: diffHtml(current ? current.markdown : "", text), effectiveInText: rendered.effective?.iso || null };
}

// Adds a version and makes it current. Never touches existing versions.
async function publish(slug, { markdown, effective_date, note }, userId) {
  const doc = await bySlug(slug);
  if (!doc) return null;
  const { text } = await check(slug, markdown);
  return db().transaction(async (trx) => {
    const [{ n }] = await trx("legal_document_versions").where({ document_id: doc.id }).max({ n: "version_number" }).forUpdate();
    const version_number = (n || 0) + 1;
    const [id] = await trx("legal_document_versions").insert({ document_id: doc.id, version_number, markdown: text, effective_date, note, published_by: userId || null, published_at: new Date() });
    await trx("legal_documents").where({ id: doc.id }).update({ current_version_id: id });
    return { id, version_number };
  });
}

module.exports = { PAGES, SLUGS, documents, bySlug, page, versionsOf, check, preview, publish };
