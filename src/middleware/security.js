"use strict";

const crypto = require("node:crypto");
const helmet = require("helmet");
const config = require("../config");

// Per-request nonce for the few inline scripts we allow (the "js" class
// toggle in every page head). Everything else must come from /js or /admin.
function cspNonce(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
}

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        "style-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'"],
        "frame-src": ["https://www.google.com", "https://maps.google.com"],
        "connect-src": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "upgrade-insecure-requests": config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProd ? undefined : false,
  });
}

// Staging must never be indexed, and can be locked behind basic auth
// (STAGING_BASIC_AUTH=user:password) while Macedo tests it.
function stagingGuard(req, res, next) {
  if (config.siteEnv !== "production") res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!config.stagingBasicAuth) return next();
  const expected = Buffer.from(config.stagingBasicAuth);
  const header = req.headers.authorization || "";
  const given = header.startsWith("Basic ") ? Buffer.from(Buffer.from(header.slice(6), "base64").toString()) : Buffer.alloc(0);
  if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return next();
  res.setHeader("WWW-Authenticate", 'Basic realm="MICE staging", charset="UTF-8"');
  return res.status(401).send("Authentication required.");
}

module.exports = { cspNonce, securityHeaders, stagingGuard };
