"use strict";

// Admin > Legal pages (admin role only): publish a new version of the
// Privacy Policy or the Terms and Conditions. Paste or upload the markdown,
// preview it as the site will show it, see a word-level diff against the
// current version, then publish with an effective date and a note.
//
// Versions are never edited or deleted: there are no routes for it, and the
// legal service has no function that could do it.

const express = require("express");
const { db } = require("../../db/knex");
const { audit } = require("../../repositories/audit");
const legal = require("../../services/legal");
const { render, formatEffective } = require("../../lib/legal-markdown");
const v = require("../../validation/common");

const { parse, ValidationError, z } = v;

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const publishSchema = z.object({
  markdown: z.unknown().optional().transform((s) => String(s ?? "")),
  effective_date: z
    .unknown()
    .optional()
    .transform((s) => String(s ?? "").trim())
    .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Choose the date this version takes effect."),
  note: v.trimmed(500, "Note").refine((s) => s.length >= 3, "Say in a few words what changed and why (kept with the version)."),
});

async function versionsWithAuthors(documentId) {
  return legal
    .versionsOf(documentId)
    .leftJoin("admin_users as u", "u.id", "legal_document_versions.published_by")
    .select("legal_document_versions.id", "version_number", "effective_date", "published_at", "note", "u.name as published_by_name");
}

router.get(
  "/",
  wrap(async (req, res) => {
    const docs = await legal.documents();
    const rows = await Promise.all(
      docs.map(async (d) => {
        const versions = await legal.versionsOf(d.id).select("id", "effective_date", "published_at");
        const current = versions.find((x) => x.id === d.current_version_id);
        return { ...d, count: versions.length, effective: current ? formatEffective(current.effective_date) : null, published_at: current?.published_at };
      })
    );
    res.render("admin/legal/list", { title: "Legal pages", rows });
  })
);

router.get(
  "/:slug",
  wrap(async (req, res, next) => {
    const doc = await legal.bySlug(req.params.slug);
    if (!doc) return next();
    const versions = await versionsWithAuthors(doc.id);
    const current = await db()("legal_document_versions").where({ id: doc.current_version_id }).first();
    res.render("admin/legal/document", {
      title: doc.title,
      doc,
      current,
      currentEffective: current ? formatEffective(current.effective_date) : null,
      versions: versions.map((x) => ({ ...x, effective: formatEffective(x.effective_date), isCurrent: x.id === doc.current_version_id })),
    });
  })
);

router.get(
  "/:slug/versions/:n",
  wrap(async (req, res, next) => {
    const page = await legal.page(req.params.slug, Number(req.params.n));
    if (!page) return next();
    const [version] = (await versionsWithAuthors(page.doc.id)).filter((x) => x.id === page.version.id);
    res.render("admin/legal/version", { title: `${page.doc.title}, version ${page.version.version_number}`, page, version, markdown: page.version.markdown });
  })
);

router.post(
  "/:slug/preview",
  wrap(async (req, res, next) => {
    const result = await legal.preview(req.params.slug, req.body?.markdown);
    if (!result) return next();
    res.json({
      ok: true,
      html: result.rendered.html,
      sections: result.rendered.sections.map((s) => s.text),
      effectiveInText: result.effectiveInText,
      diff: result.diff,
    });
  })
);

router.post(
  "/:slug/versions",
  wrap(async (req, res, next) => {
    const doc = await legal.bySlug(req.params.slug);
    if (!doc) return next();
    const data = parse(publishSchema, req.body);
    // The date in the text, if there is one, must be the date being chosen:
    // the page shows the chosen date in its badge.
    const inText = render(data.markdown).effective?.iso;
    if (inText && inText !== data.effective_date) {
      throw new ValidationError({ effective_date: `The document itself says "Effective Date: ${formatEffective(inText)}". Choose that date, or change the line in the text.` });
    }
    const current = doc.current_version_id ? await db()("legal_document_versions").where({ id: doc.current_version_id }).first() : null;
    if (current && current.markdown.replace(/\r\n?/g, "\n") === data.markdown.replace(/\r\n?/g, "\n") && formatEffective(current.effective_date) === formatEffective(data.effective_date)) {
      throw new ValidationError({ markdown: "This is the same text and date as the current version. Change the text or the effective date first." });
    }
    const { version_number } = await legal.publish(doc.slug, data, req.session.user.id);
    await audit(req, {
      action: "publish",
      entity: "legal_document",
      entityId: doc.id,
      summary: `published version ${version_number} of the ${doc.title}, effective ${formatEffective(data.effective_date)}: ${data.note}`,
    });
    res.status(201).json({ ok: true, message: `Version ${version_number} published`, redirect: `/admin/legal/${doc.slug}` });
  })
);

module.exports = router;
