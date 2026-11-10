"use strict";

// Enquiries inbox: everything sent through the contact form.

const express = require("express");
const { db } = require("../../db/knex");
const { audit } = require("../../repositories/audit");
const enquiries = require("../../services/enquiries");
const { sendCsv } = require("../../lib/csv");
const { localInputValue } = require("../../lib/dates");
const { ValidationError } = require("../../validation/common");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const FILTERS = {
  inbox: (q) => q.whereNot("status", "archived"),
  new: (q) => q.where("status", "new"),
  proposal: (q) => q.where("type", "proposal").whereNot("status", "archived"),
  general: (q) => q.where("type", "general").whereNot("status", "archived"),
  archived: (q) => q.where("status", "archived"),
  all: (q) => q,
};
const STATUSES = ["new", "read", "replied", "archived"];
const STATUS_MESSAGES = { new: "Marked as unread", read: "Marked as read", replied: "Marked as replied", archived: "Enquiry archived" };
const pickFilter = (v) => (FILTERS[v] ? v : "inbox");

async function find(id) {
  return db()("submissions").where({ id: Number(id) || 0 }).first();
}

/* List ------------------------------------------------------------------------ */

router.get(
  "/",
  wrap(async (req, res) => {
    const filter = pickFilter(req.query.show);
    const rows = await FILTERS[filter](db()("submissions")).orderBy("created_at", "desc").orderBy("id", "desc").limit(500);
    const counts = await db()("submissions")
      .select(
        db().raw("SUM(status <> 'archived') AS inbox"),
        db().raw("SUM(status = 'new') AS new_count"),
        db().raw("SUM(type = 'proposal' AND status <> 'archived') AS proposal"),
        db().raw("SUM(type = 'general' AND status <> 'archived') AS general"),
        db().raw("SUM(status = 'archived') AS archived"),
        db().raw("SUM(email_status = 'failed') AS failed")
      )
      .first();
    const open = req.query.open ? `/admin/submissions/${Number(req.query.open)}` : null;
    res.render("admin/submissions/list", { title: "Enquiries", rows, filter, counts, open });
  })
);

/* CSV export (before /:id so "export.csv" is not read as an id) ---------------------- */

router.get(
  "/export.csv",
  wrap(async (req, res) => {
    const filter = pickFilter(req.query.show);
    const rows = await FILTERS[filter](db()("submissions")).orderBy("created_at", "desc");
    const headers = ["Received (Windhoek time)", "Type", "Status", "Name", "Email", "Phone", "Organisation", "Type of event", "Destination", "Preferred dates", "Delegates", "Services", "Message", "Email notification"];
    const data = rows.map((r) => {
      const d = enquiries.parseDetails(r);
      return [
        localInputValue(r.created_at, "Africa/Windhoek").replace("T", " "),
        r.type === "proposal" ? "Proposal request" : "General enquiry",
        r.status,
        r.name,
        r.email,
        r.phone,
        r.company || d.organisation,
        d.event_type,
        d.destination,
        d.dates,
        d.delegates,
        (d.services || []).join("; "),
        r.message,
        r.email_status,
      ];
    });
    const stamp = new Date().toISOString().slice(0, 10);
    await audit(req, { action: "export", entity: "submission", summary: `exported ${rows.length} enquiries (${filter})` });
    sendCsv(res, `mice-enquiries-${filter}-${stamp}.csv`, headers, data);
  })
);

/* Detail (panel fragment). Opening a new enquiry marks it as read. ------------------- */

router.get(
  "/:id",
  wrap(async (req, res, next) => {
    const s = await find(req.params.id);
    if (!s) return next();
    let markedRead = false;
    if (s.status === "new") {
      await db()("submissions").where({ id: s.id }).update({ status: "read" });
      s.status = "read";
      markedRead = true;
    }
    res.render("admin/submissions/detail", { s, details: enquiries.detailList(s), markedRead });
  })
);

/* Actions ------------------------------------------------------------------------- */

router.post(
  "/:id/status",
  wrap(async (req, res, next) => {
    const s = await find(req.params.id);
    if (!s) return next();
    const status = String(req.body.status || "");
    if (!STATUSES.includes(status)) throw new ValidationError({ status: "Choose a valid status." });
    await db()("submissions").where({ id: s.id }).update({ status });
    await audit(req, { action: "update", entity: "submission", entityId: s.id, summary: `marked the enquiry from ${s.name} as ${status}` });
    res.json({ ok: true, message: STATUS_MESSAGES[status] });
  })
);

router.post(
  "/:id/resend",
  wrap(async (req, res, next) => {
    const s = await find(req.params.id);
    if (!s) return next();
    const result = await enquiries.notifyTeam(s);
    if (result.status !== "sent") {
      const err = new Error(result.status === "skipped" ? `Not sent: ${result.error}` : `The email still could not be sent: ${result.error}`);
      err.status = 502;
      err.expose = true;
      throw err;
    }
    await audit(req, { action: "update", entity: "submission", entityId: s.id, summary: `re-sent the email for the enquiry from ${s.name}` });
    res.json({ ok: true, message: "Email notification sent" });
  })
);

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const s = await find(req.params.id);
    if (!s) return next();
    await db()("submissions").where({ id: s.id }).delete();
    await audit(req, { action: "delete", entity: "submission", entityId: s.id, summary: `deleted the enquiry from ${s.name}` });
    res.json({ ok: true, message: "Enquiry deleted" });
  })
);

module.exports = router;
