"use strict";

const users = require("../repositories/users");

// Admin pages: redirect to the login screen. Admin JSON/XHR calls: 401, so
// the browser code can send the user to log in again instead of failing silently.
function wantsJson(req) {
  return req.xhr || (req.get("accept") || "").includes("application/json") || req.get("x-requested-with") === "fetch";
}

function requireAdmin(req, res, next) {
  if (req.session?.user) {
    res.locals.currentUser = req.session.user;
    return next();
  }
  if (wantsJson(req)) return res.status(401).json({ error: "Your session has ended. Please log in again." });
  const nextUrl = req.originalUrl.startsWith("/admin") ? `?next=${encodeURIComponent(req.originalUrl)}` : "";
  return res.redirect(`/admin/login${nextUrl}`);
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session?.user?.role === role) return next();
    const err = new Error("You do not have permission to do that.");
    err.status = 403;
    err.expose = true;
    return next(err);
  };
}

// The session only remembers who logged in. Role, name and status are read
// from the database on every admin request, so a demotion or deactivation
// applies straight away instead of when the session happens to end.
async function loadCurrentUser(req, res, next) {
  try {
    const row = await users.findById(req.session.user.id);
    if (!row || !row.is_active) {
      return req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie("mice.sid");
        if (wantsJson(req)) return res.status(401).json({ error: "Your session has ended. Please log in again." });
        return res.redirect("/admin/login");
      });
    }
    const fresh = { id: row.id, name: row.name, email: row.email, role: row.role, mustChangePassword: Boolean(row.must_change_password) };
    const old = req.session.user;
    if (Object.keys(fresh).some((k) => old[k] !== fresh[k])) req.session.user = fresh;
    res.locals.currentUser = fresh;
    return next();
  } catch (err) {
    return next(err);
  }
}

// An account with a temporary password can only reach My account (and log
// out, which is handled before this runs) until its owner sets a new one.
function requirePasswordSet(req, res, next) {
  if (!req.session.user.mustChangePassword || req.path === "/account" || req.path.startsWith("/account/")) return next();
  if (wantsJson(req)) return res.status(403).json({ error: "Set your own password on the My account page first." });
  return res.redirect("/admin/account");
}

module.exports = { requireAdmin, requireRole, wantsJson, loadCurrentUser, requirePasswordSet };
