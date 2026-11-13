"use strict";

const { db } = require("../db/knex");
const media = require("./media");
const settings = require("../services/settings");

// Who may appear on the Team page: published, with consent confirmed.
// Draft or unconsented members never reach the public site.
async function published() {
  const rows = await db()("team_members").where({ status: "published", consent_confirmed: true }).orderBy("sort_order").orderBy("id");
  return media.attach(rows, "photo_media_id", "photo");
}

// The CEO block, or null while it is not published (the page then keeps its
// "photo coming soon" placeholder).
async function ceo() {
  const c = await settings.get("ceo");
  if (c.status !== "published" || !c.name || !c.photo_media_id) return null;
  const photo = (await media.byIds([c.photo_media_id])).get(c.photo_media_id);
  return photo ? { ...c, photo } : null;
}

module.exports = { published, ceo };
