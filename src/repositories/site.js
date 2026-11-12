"use strict";

const { db } = require("../db/knex");

// Figures shown across the public site (stats cards, footer, page copy):
// destination countries and published partners. Always live, never typed in.
async function counts() {
  const [[d], [p]] = await Promise.all([
    db()("countries").where({ is_destination: true }).count({ n: "*" }),
    db()("partners").where({ status: "published" }).count({ n: "*" }),
  ]);
  return { destinations: Number(d.n), partners: Number(p.n) };
}

module.exports = { counts };
