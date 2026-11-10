"use strict";

// Newsletter sign-ups. The answer is the same whether or not the address was
// already on the list, so the form cannot be used to find out who subscribed.

const crypto = require("node:crypto");
const { db } = require("../db/knex");

const newToken = () => crypto.randomBytes(24).toString("hex");

async function subscribe(email, source) {
  const k = db();
  const existing = await k("subscribers").where({ email }).first();
  if (!existing) {
    try {
      await k("subscribers").insert({ email, token: newToken(), source: source || null });
    } catch (err) {
      // Two sign-ups for the same address at the same moment: already done.
      if (err.code !== "ER_DUP_ENTRY") throw err;
    }
    return "subscribed";
  }
  if (existing.status === "unsubscribed") {
    await k("subscribers").where({ id: existing.id }).update({ status: "subscribed", unsubscribed_at: null, source: source || existing.source });
    return "resubscribed";
  }
  return "already";
}

function byToken(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ""))) return Promise.resolve(undefined);
  return db()("subscribers").where({ token }).first();
}

async function unsubscribe(id) {
  await db()("subscribers").where({ id }).update({ status: "unsubscribed", unsubscribed_at: new Date() });
}

// Where the sign-up happened, from the page the form was on.
function sourceFrom(req) {
  const referer = req.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).pathname.slice(0, 120) || null;
  } catch {
    return null;
  }
}

module.exports = { subscribe, byToken, unsubscribe, sourceFrom };
