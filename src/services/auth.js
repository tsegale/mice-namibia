"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const users = require("../repositories/users");

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const BCRYPT_COST = 12;
// bcrypt only reads the first 72 bytes; a cap keeps that from surprising anyone.
const MAX_PASSWORD_LENGTH = 72;
// Compared against when the email is unknown, so response time does not
// reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

// Shared by the admin forms and scripts/create-admin.js. Returns a message,
// or null when the password is acceptable.
function validatePasswordStrength(plain) {
  if (typeof plain !== "string" || plain.length < 12) return "Use at least 12 characters.";
  if (plain.length > MAX_PASSWORD_LENGTH) return `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  if (!/[a-z]/i.test(plain) || !/[0-9]/.test(plain)) return "Use a mix of letters and numbers.";
  return null;
}

// Temporary passwords for new or reset accounts: 16 characters from an
// alphabet without look-alikes (0/O, 1/l/I), always with letters and digits.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_LENGTH = 16;
function generateTemporaryPassword() {
  for (;;) {
    let out = "";
    for (let i = 0; i < TEMP_LENGTH; i++) out += TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)];
    if (!validatePasswordStrength(out)) return out;
  }
}

async function verifyPassword(userId, plain) {
  const hash = await users.passwordHashOf(userId);
  if (!hash) return false;
  return bcrypt.compare(String(plain || ""), hash);
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

module.exports = { authenticate, hashPassword, verifyPassword, validatePasswordStrength, generateTemporaryPassword, MAX_ATTEMPTS, LOCK_MINUTES, MAX_PASSWORD_LENGTH };
