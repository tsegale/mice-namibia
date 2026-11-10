"use strict";

const { db } = require("../db/knex");

const PUBLIC_COLUMNS = ["id", "name", "email", "role", "is_active", "last_login_at", "created_at"];

module.exports = {
  findByEmail(email) {
    return db()("admin_users").whereRaw("LOWER(email) = ?", [String(email).trim().toLowerCase()]).first();
  },
  findById(id) {
    return db()("admin_users").select(PUBLIC_COLUMNS).where({ id }).first();
  },
  list() {
    return db()("admin_users").select(PUBLIC_COLUMNS).orderBy("name");
  },
  async create({ name, email, passwordHash, role }) {
    const [id] = await db()("admin_users").insert({ name, email: email.trim().toLowerCase(), password_hash: passwordHash, role });
    return id;
  },
  updatePassword(id, passwordHash) {
    return db()("admin_users").where({ id }).update({ password_hash: passwordHash, failed_attempts: 0, locked_until: null });
  },
  recordFailure(id, attempts, lockedUntil) {
    return db()("admin_users").where({ id }).update({ failed_attempts: attempts, locked_until: lockedUntil });
  },
  recordLogin(id) {
    return db()("admin_users").where({ id }).update({ failed_attempts: 0, locked_until: null, last_login_at: new Date() });
  },
  count() {
    return db()("admin_users").count({ n: "*" }).first().then((r) => Number(r.n));
  },
};
