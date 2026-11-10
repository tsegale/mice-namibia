"use strict";

const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const config = require("../../config");
const { csrfProtection } = require("../../middleware/csrf");
const { requireAdmin } = require("../../middleware/auth");
const { authenticate } = require("../../services/auth");
const { audit, recent: recentActivity } = require("../../repositories/audit");
const stats = require("../../repositories/stats");
const { db } = require("../../db/knex");

const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(csrfProtection);

/* Login / logout ------------------------------------------------------------ */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: (req, res) =>
    res.status(429).render("admin/login", {
      error: "Too many login attempts from this connection. Please wait 15 minutes and try again.",
      notice: null,
      email: "",
      next: "",
    }),
});

function safeNext(value) {
  const v = String(value || "");
  return v.startsWith("/admin") && !v.startsWith("//") && !v.includes("\\") ? v : "/admin";
}

router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/admin");
  res.render("admin/login", {
    error: null,
    notice: req.query.loggedout ? "You have been logged out." : null,
    email: "",
    next: safeNext(req.query.next),
  });
});

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");
    const nextUrl = safeNext(req.body.next);
    const result = email && password ? await authenticate(email, password) : { ok: false, reason: "invalid" };

    if (!result.ok) {
      await audit(req, { action: "login_failed", summary: `failed login attempt for ${email.slice(0, 120)}` });
      const error =
        result.reason === "locked"
          ? `This account is locked for ${result.minutes} more minute${result.minutes === 1 ? "" : "s"} after too many failed attempts.`
          : "That email and password combination is not correct.";
      return res.status(result.reason === "locked" ? 423 : 401).render("admin/login", { error, notice: null, email, next: nextUrl });
    }

    // New session id on login (prevents session fixation) and a new CSRF token.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = result.user;
      req.session.save(async (saveErr) => {
        if (saveErr) return next(saveErr);
        await audit(req, { action: "login", summary: "logged in" });
        res.redirect(nextUrl);
      });
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res, next) => {
  const user = req.session.user;
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("mice.sid");
    if (user) audit({ session: { user }, ip: req.ip }, { action: "logout", summary: "logged out" });
    res.redirect("/admin/login?loggedout=1");
  });
});

/* Everything below requires a logged-in admin -------------------------------- */

router.use(requireAdmin);
router.use(async (req, res, next) => {
  try {
    res.locals.navCounts = { submissions: await stats.newSubmissionCount() };
    next();
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const [counts, recentSubmissions, nextConferences, activity] = await Promise.all([
      stats.dashboard(),
      db()("submissions").orderBy("created_at", "desc").limit(6),
      db()("conferences as c")
        .join("countries as n", "n.iso2", "c.country_iso2")
        .where("c.status", "published")
        .where("c.ends_at", ">=", new Date())
        .orderBy("c.starts_at")
        .limit(5)
        .select("c.*", "n.name as country_name"),
      recentActivity(8),
    ]);
    res.render("admin/dashboard", { title: "Dashboard", stats: counts, recentSubmissions, nextConferences, activity });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
