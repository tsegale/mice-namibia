"use strict";

// The public forms: contact/proposal enquiries and newsletter sign-ups.
//
// Each works with and without JavaScript. With it, main.js posts in the
// background and gets JSON; without it the browser posts normally and gets a
// page (the same page with messages, or a redirect after success so a reload
// does not send twice).
//
// No CSRF token here: these forms change nothing for a logged-in user, and a
// token would need a session cookie for every visitor. Instead: same-origin
// check, a hidden spam-trap field, rate limits and strict validation.

const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const config = require("../config");
const META = require("./page-meta");
const conferences = require("../repositories/conferences");
const destinations = require("../repositories/destinations");
const { wantsJson } = require("../middleware/auth");
const { parse, ValidationError } = require("../validation/common");
const forms = require("../validation/forms");
const enquiries = require("../services/enquiries");
const subscribers = require("../services/subscribers");
const logger = require("../lib/logger");

const router = express.Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const destinationNames = async () => (await destinations.published()).map((d) => d.name);
const PHONE = "+264 81 245 5852";

// Server-rendered newsletter state after a no-JavaScript sign-up.
router.use((req, res, next) => {
  if (req.method === "GET") {
    if (req.query.subscribed === "1") res.locals.newsletterState = "subscribed";
    else if (req.query.subscribe_error === "1") res.locals.newsletterState = "invalid";
  }
  next();
});

function sameOrigin(req) {
  // Modern browsers say where a request comes from in Sec-Fetch-Site.
  const site = req.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;
  const origin = req.get("origin");
  if (!origin || origin === "null") return !site; // older browsers and non-browser clients
  try {
    const host = new URL(origin).host;
    return host === req.get("host") || origin === new URL(config.baseUrl).origin;
  } catch {
    return false;
  }
}

function originCheck(req, res, next) {
  if (sameOrigin(req)) return next();
  logger.warn({ origin: req.get("origin") }, "cross-origin form post refused");
  const message = "This form can only be sent from our website.";
  return wantsJson(req) ? res.status(403).json({ error: message }) : res.status(403).type("text").send(message);
}

const limiter = (limit, windowMinutes, onLimit) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: config.isTest ? 1000 : limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    handler: onLimit,
  });

const isSpam = (req) => String(req.body?.website || "").trim() !== "";

/* Contact ----------------------------------------------------------------------- */

async function renderContact(res, status, form) {
  const [upcoming, destinationNamesList] = await Promise.all([conferences.upcoming(), destinationNames()]);
  const options = { EVENT_TYPES: forms.EVENT_TYPES, DESTINATIONS: destinationNamesList, SERVICES: forms.SERVICES };
  res.status(status).render("pages/contact", { page: META.contact, upcoming, options, form });
}

router.get(
  "/contact",
  wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    await renderContact(res, 200, { values: {}, errors: {}, sent: req.query.sent === "1" });
  })
);

const contactLimiter = limiter(8, 60, (req, res, next) => {
  const error = `You have sent several messages in a short time. Please wait a little, or call us on ${PHONE}.`;
  if (wantsJson(req)) return res.status(429).json({ error });
  renderContact(res, 429, { values: req.body || {}, errors: {}, error }).catch(next);
});

router.post(
  "/contact",
  originCheck,
  contactLimiter,
  wrap(async (req, res) => {
    const json = wantsJson(req);
    const done = () => (json ? res.status(201).json({ ok: true, message: "Thank you, your message is on its way." }) : res.redirect(303, "/contact?sent=1#contact-form"));

    if (isSpam(req)) {
      logger.info({ ip: req.ip }, "contact form spam trap triggered");
      return done();
    }

    let data;
    try {
      data = parse(forms.contactSchema(await destinationNames()), req.body);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      if (json) return res.status(422).json({ error: "Please check the highlighted fields.", fieldErrors: err.fieldErrors });
      return renderContact(res, 422, { values: req.body || {}, errors: err.fieldErrors, error: "Please check the highlighted fields." });
    }

    const row = await enquiries.create(data, req);
    // Awaited on purpose: the outcome is recorded on the enquiry. A failure
    // never reaches the visitor because the enquiry is already saved.
    await enquiries.notifyTeam(row);
    return done();
  })
);

/* Newsletter ---------------------------------------------------------------------- */

// Back to the page the form was on (same site only), or the homepage.
function backTo(req, query) {
  let path = "/";
  try {
    const ref = new URL(req.get("referer") || "");
    if (ref.host === req.get("host")) path = ref.pathname;
  } catch {
    /* no or bad referer */
  }
  return `${path}?${query}#newsletter`;
}

const newsletterLimiter = limiter(10, 60, (req, res) => {
  const error = "Too many sign-ups from this connection. Please try again later.";
  return wantsJson(req) ? res.status(429).json({ error }) : res.redirect(303, backTo(req, "subscribe_error=1"));
});

router.post(
  "/newsletter",
  originCheck,
  newsletterLimiter,
  wrap(async (req, res) => {
    const json = wantsJson(req);
    const done = () => (json ? res.status(201).json({ ok: true, message: "Thank you for subscribing." }) : res.redirect(303, backTo(req, "subscribed=1")));
    if (isSpam(req)) return done();
    let data;
    try {
      data = parse(forms.newsletter, req.body);
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return json ? res.status(422).json({ error: err.fieldErrors.email, fieldErrors: err.fieldErrors }) : res.redirect(303, backTo(req, "subscribe_error=1"));
    }
    await subscribers.subscribe(data.email, subscribers.sourceFrom(req));
    return done();
  })
);

// Unsubscribe links in future mailings: /newsletter/unsubscribe/<token>.
// GET only shows a button; mail scanners that open links must not
// unsubscribe people by accident. The POST also accepts one-click
// unsubscribe from mail apps (RFC 8058).
router.get(
  "/newsletter/unsubscribe/:token",
  wrap(async (req, res) => {
    const sub = await subscribers.byToken(req.params.token);
    res.status(sub ? 200 : 404).render("pages/unsubscribe", { page: META.unsubscribe, state: !sub ? "invalid" : sub.status === "unsubscribed" ? "done" : "confirm", token: req.params.token });
  })
);

router.post(
  "/newsletter/unsubscribe/:token",
  wrap(async (req, res) => {
    const sub = await subscribers.byToken(req.params.token);
    if (sub && sub.status !== "unsubscribed") await subscribers.unsubscribe(sub.id);
    if (wantsJson(req) || req.body?.["List-Unsubscribe"]) return res.status(sub ? 200 : 404).json({ ok: Boolean(sub) });
    res.status(sub ? 200 : 404).render("pages/unsubscribe", { page: META.unsubscribe, state: sub ? "done" : "invalid", token: req.params.token });
  })
);

module.exports = router;
