"use strict";

// Accounts created or reset by an admin get a temporary password. Until the
// person sets their own, every admin page sends them to My account.

exports.up = async function up(knex) {
  await knex.schema.alterTable("admin_users", (t) => {
    t.boolean("must_change_password").notNullable().defaultTo(false).after("is_active");
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("admin_users", (t) => {
    t.dropColumn("must_change_password");
  });
};
