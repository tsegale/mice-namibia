"use strict";

// Newsletter sign-ups. The site does not send newsletters itself; the list is
// exported to whichever mailing tool the team uses.

const express = require("express");
const { db } = require("../../db/knex");
const { audit } = require("../../repositories/audit");
const { sendCsv } = require("../../lib/csv");
const { localInputValue } = require("../../lib/dates");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const FILTERS = {
  subscribed: (q) => q.where("status", "subscribed"),
  unsubscribed: (q) => q.where("status", "unsubscribed"),
  all: (q) => q,
};
const pickFilter = (v) => (FILTERS[v] ? v : "subscribed");
const windhoek = (d) => (d ? localInputValue(d, "Africa/Windhoek").replace("T", " ") : "");

router.get(
  "/",
  wrap(async (req, res) => {
    const filter = pickFilter(req.query.show);
    const rows = await FILTERS[filter](db()("subscribers")).orderBy("created_at", "desc").orderBy("id", "desc");
    const counts = await db()("subscribers")
      .select(db().raw("COUNT(*) AS all_count"), db().raw("SUM(status = 'subscribed') AS subscribed"), db().raw("SUM(status = 'unsubscribed') AS unsubscribed"))
      .first();
    res.render("admin/subscribers/list", { title: "Subscribers", rows, filter, counts });
  })
);

router.get(
  "/export.csv",
  wrap(async (req, res) => {
    const filter = pickFilter(req.query.show);
    const rows = await FILTERS[filter](db()("subscribers")).orderBy("created_at");
    const data = rows.map((r) => [r.email, r.status, windhoek(r.created_at), r.source, windhoek(r.unsubscribed_at)]);
    await audit(req, { action: "export", entity: "subscriber", summary: `exported ${rows.length} subscribers (${filter})` });
    sendCsv(res, `mice-subscribers-${filter}-${new Date().toISOString().slice(0, 10)}.csv`, ["Email", "Status", "Signed up (Windhoek time)", "Signed up on page", "Unsubscribed"], data);
  })
);

router.post(
  "/:id/unsubscribe",
  wrap(async (req, res, next) => {
    const s = await db()("subscribers").where({ id: Number(req.params.id) || 0 }).first();
    if (!s) return next();
    if (s.status !== "unsubscribed") await db()("subscribers").where({ id: s.id }).update({ status: "unsubscribed", unsubscribed_at: new Date() });
    await audit(req, { action: "update", entity: "subscriber", entityId: s.id, summary: `unsubscribed ${s.email}` });
    res.json({ ok: true, message: `${s.email} unsubscribed` });
  })
);

// Permanent removal, for "please delete my data" requests.
router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const s = await db()("subscribers").where({ id: Number(req.params.id) || 0 }).first();
    if (!s) return next();
    await db()("subscribers").where({ id: s.id }).delete();
    await audit(req, { action: "delete", entity: "subscriber", entityId: s.id, summary: "deleted a subscriber at their request" });
    res.json({ ok: true, message: "Subscriber deleted" });
  })
);

module.exports = router;
