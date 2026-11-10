"use strict";

const { db } = require("../db/knex");
const logger = require("../lib/logger");

// 301s for old addresses: every .html URL from the static review build, and
// any slug an admin has changed since. Looked up only when no route matched,
// from a small in-memory copy refreshed every minute.
let cache = null;
let loadedAt = 0;
const TTL = 60 * 1000;

async function table() {
  if (!cache || Date.now() - loadedAt > TTL) {
    const rows = await db()("redirects").select("from_path", "to_path", "status_code");
    cache = new Map(rows.map((r) => [r.from_path, r]));
    loadedAt = Date.now();
  }
  return cache;
}

function invalidate() {
  cache = null;
}

async function redirects(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  try {
    const hit = (await table()).get(req.path) || (req.path.length > 1 && req.path.endsWith("/") ? (await table()).get(req.path.slice(0, -1)) : null);
    if (!hit) return next();
    const qs = req.originalUrl.slice(req.path.length);
    return res.redirect(hit.status_code, hit.to_path + qs);
  } catch (err) {
    logger.error({ err }, "redirect lookup failed");
    return next();
  }
}

// Records old -> new when a slug changes, and repoints older redirects that
// pointed at the old address so there are never redirect chains.
async function recordMove(trx, fromPath, toPath) {
  if (!fromPath || fromPath === toPath) return;
  await trx("redirects").where({ to_path: fromPath }).update({ to_path: toPath });
  await trx("redirects").where({ from_path: toPath }).delete();
  const existing = await trx("redirects").where({ from_path: fromPath }).first();
  if (existing) await trx("redirects").where({ id: existing.id }).update({ to_path: toPath });
  else await trx("redirects").insert({ from_path: fromPath, to_path: toPath, status_code: 301 });
  invalidate();
}

module.exports = { redirects, recordMove, invalidate };
