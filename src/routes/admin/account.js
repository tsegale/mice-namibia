"use strict";

// My account: every signed-in user, admin or editor, manages their own name,
// email and password here.

const express = require("express");
const users = require("../../repositories/users");
const { audit } = require("../../repositories/audit");
const { parse, ValidationError } = require("../../validation/common");
const schemas = require("../../validation/users");
const { hashPassword, verifyPassword } = require("../../services/auth");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get(
  "/",
  wrap(async (req, res) => {
    const me = await users.findById(req.session.user.id);
    res.render("admin/account", { title: "My account", me });
  })
);

router.put(
  "/",
  wrap(async (req, res) => {
    const data = parse(schemas.profile, req.body);
    const me = req.session.user;
    if (await users.emailTaken(data.email, me.id)) throw new ValidationError({ email: "Another account already uses this email address." });
    await users.updateProfile(me.id, data);
    const changed = [data.name !== me.name && "name", data.email !== me.email && "email"].filter(Boolean);
    req.session.user = { ...me, name: data.name, email: data.email };
    if (changed.length) await audit(req, { action: "update", entity: "admin_user", entityId: me.id, summary: `changed their own ${changed.join(" and ")}` });
    res.json({ ok: true, message: changed.length ? "Your details are saved" : "Nothing to change" });
  })
);

function regenerate(req) {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}
function save(req) {
  return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

router.post(
  "/password",
  wrap(async (req, res) => {
    const data = parse(schemas.passwordChange, req.body);
    const me = req.session.user;
    if (!(await verifyPassword(me.id, data.current_password))) {
      throw new ValidationError({ current_password: "That is not your current password." });
    }
    await users.updatePassword(me.id, await hashPassword(data.new_password));

    // New session id for this browser, then sign out every other device.
    await regenerate(req);
    req.session.user = { ...me, mustChangePassword: false };
    await save(req);
    const removed = await users.deleteSessions(me.id, { exceptSessionId: req.sessionID });
    await audit(req, {
      action: "password_change",
      entity: "admin_user",
      entityId: me.id,
      summary: `changed their password${removed ? ` and signed out ${removed} other session${removed === 1 ? "" : "s"}` : ""}`,
    });
    res.json({ ok: true, message: removed ? "Password changed. Your other devices have been signed out." : "Password changed", redirect: me.mustChangePassword ? "/admin" : "/admin/account" });
  })
);

module.exports = router;
