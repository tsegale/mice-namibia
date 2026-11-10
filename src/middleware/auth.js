"use strict";

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

module.exports = { requireAdmin, requireRole, wantsJson };
