"use strict";

const { db } = require("../db/knex");
const destinations = require("./destinations");

// What every public page needs: the destination list (footer flags) and the
// figures shown across the site (destination countries, published partners).
// Always live, never typed in.
async function counts() {
  const [list, [p]] = await Promise.all([destinations.published(), db()("partners").where({ status: "published" }).count({ n: "*" })]);
  return { destinations: list.length, partners: Number(p.n), destinationList: list };
}

module.exports = { counts };
