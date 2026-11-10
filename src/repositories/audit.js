"use strict";

const { db } = require("../db/knex");
const logger = require("../lib/logger");

// Who changed what, and when. Never allowed to break the action it records.
async function audit(req, { action, entity = null, entityId = null, summary = null }) {
  try {
    await db()("audit_log").insert({
      user_id: req?.session?.user?.id || null,
      action,
      entity,
      entity_id: entityId,
      summary: summary ? String(summary).slice(0, 255) : null,
      ip: req?.ip || null,
    });
  } catch (err) {
    logger.error({ err }, "audit log write failed");
  }
}

function recent(limit = 15) {
  return db()("audit_log as a")
    .leftJoin("admin_users as u", "u.id", "a.user_id")
    .select("a.*", "u.name as user_name")
    .orderBy("a.id", "desc")
    .limit(limit);
}

module.exports = { audit, recent };
