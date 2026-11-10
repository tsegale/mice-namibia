"use strict";

const { db } = require("../db/knex");

async function count(query) {
  const row = await query.count({ n: "*" }).first();
  return Number(row?.n || 0);
}

async function dashboard() {
  const now = new Date();
  const k = db();
  const [upcomingConferences, venues, posts, scheduledPosts, newSubmissions, subscribers] = await Promise.all([
    count(k("conferences").where({ status: "published" }).where("ends_at", ">=", now)),
    count(k("venues").where({ status: "published" })),
    count(k("posts").where({ status: "published" }).where("published_at", "<=", now)),
    count(k("posts").where({ status: "published" }).where("published_at", ">", now)),
    count(k("submissions").where({ status: "new" })),
    count(k("subscribers").where({ status: "subscribed" })),
  ]);
  return { upcomingConferences, venues, posts, scheduledPosts, newSubmissions, subscribers };
}

function newSubmissionCount() {
  return count(db()("submissions").where({ status: "new" }));
}

module.exports = { dashboard, newSubmissionCount };
