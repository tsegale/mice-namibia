"use strict";

const { db } = require("../db/knex");

const HOME_LIMIT = 5;

// Published questions grouped for the FAQ page, groups and questions in
// their admin order. Groups with nothing published are left out.
async function publishedGroups() {
  const [groups, faqs] = await Promise.all([
    db()("faq_groups").orderBy("sort_order").orderBy("id"),
    db()("faqs").where({ status: "published" }).orderBy("sort_order").orderBy("id"),
  ]);
  for (const g of groups) g.faqs = faqs.filter((f) => f.group_id === g.id);
  return groups.filter((g) => g.faqs.length);
}

// The homepage preview: published questions marked for it, in list order
// (group order, then question order), at most HOME_LIMIT.
function forHome(limit = HOME_LIMIT) {
  return db()("faqs as f")
    .join("faq_groups as g", "g.id", "f.group_id")
    .where("f.status", "published")
    .where("f.show_on_home", true)
    .orderBy([{ column: "g.sort_order" }, { column: "g.id" }, { column: "f.sort_order" }, { column: "f.id" }])
    .limit(limit)
    .select("f.*");
}

module.exports = { publishedGroups, forHome, HOME_LIMIT };
