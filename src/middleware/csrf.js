"use strict";

const crypto = require("node:crypto");

// Synchronizer-token CSRF protection for the admin (session based). The token
// is rendered into every admin page (<meta name="csrf-token">) and must come
// back on every state-changing request, as the `_csrf` form field or the
// `x-csrf-token` header used by admin.js fetch calls.
function ensureToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  const token = ensureToken(req);
  res.locals.csrfToken = token;
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const sent = String(req.get("x-csrf-token") || req.body?._csrf || "");
  const a = Buffer.from(sent);
  const b = Buffer.from(token);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  const err = new Error("Your session expired or the form was out of date. Please reload the page and try again.");
  err.status = 403;
  err.code = "EBADCSRFTOKEN";
  err.expose = true;
  return next(err);
}

module.exports = { csrfProtection, ensureToken };
