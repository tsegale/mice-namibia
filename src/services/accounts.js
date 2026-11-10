"use strict";

// Changes to admin accounts made by an admin, with the guard rails that keep
// the panel from locking everybody out:
// - nobody can deactivate, demote or delete their own account;
// - the last active admin can never be demoted, deactivated or deleted.
// The admin rows are locked for the check, so two admins demoting each other
// at the same moment cannot both succeed.

const { db } = require("../db/knex");
const users = require("../repositories/users");
const { ValidationError } = require("../validation/common");

const LAST_ADMIN = "There must always be at least one active admin. Make someone else an admin first.";

function refuse(message, field = "form") {
  return new ValidationError({ [field]: message }, message);
}

// Throws unless an active admin other than targetId would remain.
async function assertAnotherActiveAdmin(trx, targetId, field = "form") {
  const admins = await trx("admin_users").where({ role: "admin", is_active: true }).forUpdate().pluck("id");
  if (!admins.some((id) => id !== targetId)) throw refuse(LAST_ADMIN, field);
}

async function changeRole(actorId, target, role) {
  if (role === target.role) return false;
  await db().transaction(async (trx) => {
    if (target.role === "admin" && target.is_active) await assertAnotherActiveAdmin(trx, target.id, "role");
    if (target.id === actorId && role !== "admin") throw refuse("You cannot remove your own admin role. Ask another admin to do it.", "role");
    await trx("admin_users").where({ id: target.id }).update({ role });
  });
  return true;
}

async function setActive(actorId, target, active) {
  if (Boolean(target.is_active) === active) return false;
  await db().transaction(async (trx) => {
    if (!active) {
      if (target.role === "admin") await assertAnotherActiveAdmin(trx, target.id);
      if (target.id === actorId) throw refuse("You cannot deactivate your own account.");
    }
    await trx("admin_users").where({ id: target.id }).update({ is_active: active });
  });
  // Deactivation takes effect at once, on every device.
  if (!active) await users.deleteSessions(target.id);
  return true;
}

async function remove(actorId, target) {
  await db().transaction(async (trx) => {
    if (target.role === "admin" && target.is_active) await assertAnotherActiveAdmin(trx, target.id);
    if (target.id === actorId) throw refuse("You cannot delete your own account.");
    await trx("admin_users").where({ id: target.id }).delete();
  });
  await users.deleteSessions(target.id);
}

module.exports = { changeRole, setActive, remove, assertAnotherActiveAdmin, LAST_ADMIN };
