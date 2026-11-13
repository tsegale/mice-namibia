"use strict";

const logger = require("../lib/logger");
const { wantsJson } = require("./auth");
const seo = require("../services/seo");

function notFound(req, res, next) {
  const err = new Error("Page not found");
  err.status = 404;
  err.expose = true;
  next(err);
}

// One error handler for the whole app. Messages are only shown to the user
// when the error was raised on purpose (expose); anything unexpected is
// logged with its stack and the user sees a generic message.
function errorHandler(err, req, res, next) {
  let status = Number(err.status || err.statusCode) || 500;
  if (err.code === "LIMIT_FILE_SIZE") status = 413;
  if (status >= 500) logger.error({ err, url: req.originalUrl }, "request failed");

  const message = err.expose || status < 500 ? err.message : "Something went wrong on our side. Please try again.";
  // Part of the response already went out: Express's own handler closes the
  // connection (it sends no stack once headers are out).
  if (res.headersSent) return next(err);
  res.status(status);

  const isAdmin = req.originalUrl.startsWith("/admin");
  // Admin requests and the public forms' background posts get JSON.
  if (wantsJson(req) && (isAdmin || req.method !== "GET")) {
    return res.json({ error: message, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) });
  }
  const view = isAdmin ? "admin/error" : status === 404 ? "pages/not-found" : "public/error";
  const fail = (renderErr) => {
    logger.error({ err: renderErr }, "error view failed");
    return res.type("text").send(`${status} ${message}`);
  };
  const show = (locals) => res.render(view, locals, (renderErr, html) => (renderErr ? fail(renderErr) : res.send(html)));
  if (isAdmin || status !== 404) return show({ status, message });
  // The not-found page carries the site name from Admin > Settings.
  return seo
    .page("not-found", res.locals)
    .then((page) => show({ status, message, page }))
    .catch(fail);
}

module.exports = { notFound, errorHandler };
