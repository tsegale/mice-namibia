"use strict";

const { db } = require("../db/knex");

// Everything except the password hash.
const PUBLIC_COLUMNS = ["id", "name", "email", "role", "is_active", "must_change_password", "failed_attempts", "locked_until", "last_login_at", "created_at"];

// express-mysql-session stores each session as JSON text. CASE keeps
// JSON_EXTRACT away from any row that is not valid JSON (MySQL would error).
const SESSION_USER_ID = "CASE WHEN JSON_VALID(data) THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.user.id')) AS UNSIGNED) END";

module.exports = {
  findByEmail(email) {
    return db()("admin_users").whereRaw("LOWER(email) = ?", [String(email).trim().toLowerCase()]).first();
  },
  findById(id) {
    return db()("admin_users").select(PUBLIC_COLUMNS).where({ id }).first();
  },
  passwordHashOf(id) {
    return db()("admin_users").where({ id }).first("password_hash").then((r) => r?.password_hash || null);
  },
  list() {
    return db()("admin_users").select(PUBLIC_COLUMNS).orderBy("name");
  },
  async create({ name, email, passwordHash, role, mustChangePassword = false }) {
    const [id] = await db()("admin_users").insert({ name, email: email.trim().toLowerCase(), password_hash: passwordHash, role, must_change_password: mustChangePassword });
    return id;
  },
  // A password set by its owner clears the "change it" flag; a temporary one
  // from an admin sets it. Either way the account is unlocked.
  updatePassword(id, passwordHash, { mustChange = false } = {}) {
    return db()("admin_users").where({ id }).update({ password_hash: passwordHash, must_change_password: mustChange, failed_attempts: 0, locked_until: null });
  },
  updateProfile(id, { name, email }) {
    return db()("admin_users").where({ id }).update({ name, email: email.trim().toLowerCase() });
  },
  emailTaken(email, exceptId = 0) {
    return db()("admin_users").whereRaw("LOWER(email) = ?", [String(email).trim().toLowerCase()]).whereNot({ id: exceptId }).first("id").then(Boolean);
  },
  unlock(id) {
    return db()("admin_users").where({ id }).update({ failed_attempts: 0, locked_until: null });
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
  // Signs a user out everywhere, or everywhere but the current session.
  deleteSessions(userId, { exceptSessionId = null } = {}) {
    const q = db()("sessions").whereRaw(`${SESSION_USER_ID} = ?`, [Number(userId)]);
    if (exceptSessionId) q.whereNot({ session_id: exceptSessionId });
    return q.delete();
  },
};
