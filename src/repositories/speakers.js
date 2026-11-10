"use strict";

const { db } = require("../db/knex");
const media = require("./media");

// Who may appear on the public site: published, and either a real person who
// has given consent, or a clearly badged stock "Sample" card.
function visible(q) {
  return q.where("s.status", "published").where((w) => w.where("s.consent_confirmed", true).orWhere("s.is_sample", true));
}

async function hydrate(rows) {
  return media.attach(rows, "photo_media_id", "photo");
}

// The sample cards only hold the layout until the first real speaker is
// published; real and sample speakers are never mixed.
async function pick(query, limit) {
  const order = ["s.sort_order", "s.name"];
  let real = visible(query.clone()).where("s.is_sample", false).orderBy(order);
  if (limit) real = real.limit(limit);
  const rows = await real;
  if (rows.length) return { speakers: await hydrate(rows), samples: false };
  let samples = visible(query.clone()).where("s.is_sample", true).orderBy(order);
  if (limit) samples = samples.limit(limit);
  return { speakers: await hydrate(await samples), samples: true };
}

function forHome(limit = 4) {
  return pick(db()("speakers as s").where("s.show_on_home", true), limit);
}

function forTeamPage(limit = 8) {
  return pick(db()("speakers as s"), limit);
}

module.exports = { forHome, forTeamPage, visible, hydrate };
