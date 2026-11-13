"use strict";

// Admin > Settings (admin role only): contact details, social links, footer
// text, who receives enquiry emails, and SEO (site name, default share image,
// title and description of every fixed page). One tab and one form per
// settings group; a save clears the settings cache so the site shows it at
// once. SMTP and MAIL_TO stay in .env (MAIL_TO is the fallback recipient).

const express = require("express");
const config = require("../../config");
const media = require("../../repositories/media");
const site = require("../../repositories/site");
const META = require("../page-meta");
const { audit } = require("../../repositories/audit");
const settings = require("../../services/settings");
const { assertMedia } = require("../../services/content");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const TABS = [
  { key: "contact", label: "Contact" },
  { key: "social", label: "Social links" },
  { key: "footer", label: "Footer" },
  { key: "enquiries", label: "Enquiry emails" },
  { key: "seo", label: "SEO" },
];
const labelOf = (group) => TABS.find((t) => t.key === group)?.label;

router.get(
  "/",
  wrap(async (req, res) => {
    const tab = TABS.some((t) => t.key === req.query.tab) ? req.query.tab : "contact";
    const values = await settings.read(tab);
    // Live counts, for the {destinations} and {partners} hints.
    const extra = { counts: await site.counts() };
    if (tab === "seo") {
      const id = values.default_image_media_id;
      extra.shareImage = id ? (await media.byIds([id])).get(id) || null : null;
      extra.pages = settings.SEO_PAGES.map((key) => ({ key, label: settings.PAGE_LABELS[key] || key, path: META[key].path }));
    }
    if (tab === "enquiries") extra.mailTo = config.mail.to;
    res.render("admin/settings", { title: "Site settings", tabs: TABS, tab, values, ...extra });
  })
);

router.put(
  "/:group",
  wrap(async (req, res, next) => {
    const group = req.params.group;
    if (!labelOf(group)) return next();
    const input = settings.unflatten(req.body);
    if (group === "seo") await assertMedia([Number(input.default_image_media_id) || null], "default_image_media_id");
    const { before, after } = await settings.save(group, input);
    if (group === "seo" && before.default_image_media_id !== after.default_image_media_id) await media.releaseIfUnused([before.default_image_media_id]);
    const changed = settings.changedFields(before, after);
    if (changed.length) {
      const shown = changed.slice(0, 6).join(", ") + (changed.length > 6 ? ` and ${changed.length - 6} more` : "");
      await audit(req, { action: "update", entity: "settings", entityId: null, summary: `changed the ${labelOf(group)} settings (${shown})` });
    }
    res.json({ ok: true, message: changed.length ? `${labelOf(group)} settings saved` : "Nothing to change", redirect: `/admin/settings?tab=${group}` });
  })
);

module.exports = router;
