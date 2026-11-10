"use strict";

// Users: admins add, change and remove admin accounts. Mounted behind
// requireRole("admin"), so editors get 403 on every route here.

const express = require("express");
const users = require("../../repositories/users");
const accounts = require("../../services/accounts");
const { audit } = require("../../repositories/audit");
const { parse, ValidationError } = require("../../validation/common");
const schemas = require("../../validation/users");
const { hashPassword, generateTemporaryPassword } = require("../../services/auth");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const isLocked = (u) => Boolean(u.locked_until && new Date(u.locked_until) > new Date());

async function target(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? users.findById(id) : null;
}

router.get(
  "/",
  wrap(async (req, res) => {
    const rows = await users.list();
    const open = req.query.new ? "/admin/users/new" : req.query.edit ? `/admin/users/${Number(req.query.edit)}/edit` : null;
    res.render("admin/users/list", { title: "Users", rows, isLocked, open });
  })
);

/* Add ------------------------------------------------------------------------- */

router.get("/new", (req, res) => {
  res.render("admin/users/form", { u: { role: "editor" }, temporaryPassword: generateTemporaryPassword() });
});

router.post(
  "/",
  wrap(async (req, res) => {
    const data = parse(schemas.newUser, req.body);
    if (await users.emailTaken(data.email)) throw new ValidationError({ email: "An account with this email address already exists." });
    const id = await users.create({ name: data.name, email: data.email, role: data.role, passwordHash: await hashPassword(data.temporary_password), mustChangePassword: true });
    await audit(req, { action: "create", entity: "admin_user", entityId: id, summary: `added the ${data.role} account for ${data.email}` });
    res.status(201).json({ ok: true, message: `Account created for ${data.name}` });
  })
);

/* Edit ------------------------------------------------------------------------ */

router.get(
  "/:id/edit",
  wrap(async (req, res, next) => {
    const u = await target(req);
    if (!u) return next();
    res.render("admin/users/edit", { u, isSelf: u.id === req.session.user.id, locked: isLocked(u) });
  })
);

router.put(
  "/:id",
  wrap(async (req, res, next) => {
    const u = await target(req);
    if (!u) return next();
    const { role } = parse(schemas.roleChange, req.body);
    const changed = await accounts.changeRole(req.session.user.id, u, role);
    if (changed) await audit(req, { action: "role_change", entity: "admin_user", entityId: u.id, summary: `changed ${u.email} from ${u.role} to ${role}` });
    res.json({ ok: true, message: changed ? `${u.name} is now ${role === "admin" ? "an admin" : "an editor"}` : "Nothing to change" });
  })
);

router.post(
  "/:id/active",
  wrap(async (req, res, next) => {
    const u = await target(req);
    if (!u) return next();
    const { is_active: active } = parse(schemas.activeChange, req.body);
    const changed = await accounts.setActive(req.session.user.id, u, active);
    if (changed) await audit(req, { action: active ? "reactivate" : "deactivate", entity: "admin_user", entityId: u.id, summary: `${active ? "reactivated" : "deactivated"} ${u.email}` });
    res.json({ ok: true, message: active ? `${u.name} can log in again` : `${u.name} is deactivated and signed out` });
  })
);

router.post(
  "/:id/unlock",
  wrap(async (req, res, next) => {
    const u = await target(req);
    if (!u) return next();
    await users.unlock(u.id);
    await audit(req, { action: "unlock", entity: "admin_user", entityId: u.id, summary: `unlocked ${u.email}` });
    res.json({ ok: true, message: `${u.name} is unlocked` });
  })
);

/* Reset password -------------------------------------------------------------- */

router.get(
  "/:id/password",
  wrap(async (req, res, next) => {
    const u = await target(req);
    if (!u) return next();
    res.render("admin/users/password", { u, temporaryPassword: generateTemporaryPassword() });
  })
);

router.post(
  "/:id/password",
  wrap(async (req, res, next) => {
    const u = await target(req);
    if (!u) return next();
    // Your own password is changed on My account, where the current one is asked for.
    if (u.id === req.session.user.id) throw new ValidationError({ form: "Change your own password on the My account page." }, "Change your own password on the My account page.");
    const { temporary_password: temp } = parse(schemas.resetPassword, req.body);
    await users.updatePassword(u.id, await hashPassword(temp), { mustChange: true });
    await users.deleteSessions(u.id);
    await audit(req, { action: "password_reset", entity: "admin_user", entityId: u.id, summary: `reset the password for ${u.email}` });
    res.json({ ok: true, message: `New temporary password set for ${u.name}. They have been signed out.` });
  })
);

/* Delete ---------------------------------------------------------------------- */

router.delete(
  "/:id",
  wrap(async (req, res, next) => {
    const u = await target(req);
    if (!u) return next();
    await accounts.remove(req.session.user.id, u);
    await audit(req, { action: "delete", entity: "admin_user", entityId: u.id, summary: `deleted the account for ${u.email}` });
    res.json({ ok: true, message: `${u.name}'s account is deleted` });
  })
);

module.exports = router;
