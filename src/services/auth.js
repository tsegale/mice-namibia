"use strict";

const bcrypt = require("bcryptjs");
const users = require("../repositories/users");

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const BCRYPT_COST = 12;
// Compared against when the email is unknown, so response time does not
// reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

function validatePasswordStrength(plain) {
  if (typeof plain !== "string" || plain.length < 12) return "Use at least 12 characters.";
  if (!/[a-z]/i.test(plain) || !/[0-9]/.test(plain)) return "Use a mix of letters and numbers.";
  return null;
}

// Returns { ok: true, user } or { ok: false, reason: "invalid" | "locked", minutes? }.
async function authenticate(email, password) {
  const user = email ? await users.findByEmail(email) : null;
  if (!user || !user.is_active) {
    await bcrypt.compare(String(password || ""), DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    return { ok: false, reason: "locked", minutes };
  }
  const valid = await bcrypt.compare(String(password || ""), user.password_hash);
  if (!valid) {
    const attempts = (user.failed_attempts || 0) + 1;
    const lock = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;
    await users.recordFailure(user.id, lock ? 0 : attempts, lock);
    return lock ? { ok: false, reason: "locked", minutes: LOCK_MINUTES } : { ok: false, reason: "invalid" };
  }
  await users.recordLogin(user.id);
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

module.exports = { authenticate, hashPassword, validatePasswordStrength, MAX_ATTEMPTS, LOCK_MINUTES };
