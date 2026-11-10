"use strict";

// DATETIME (not TIMESTAMP): no 2038 limit and no session-timezone conversion.
function stamps(knex, t) {
  t.datetime("created_at").notNullable().defaultTo(knex.fn.now());
  t.datetime("updated_at").notNullable().defaultTo(knex.raw("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"));
}

module.exports = { stamps };
