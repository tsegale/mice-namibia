"use strict";

const logger = require("../lib/logger");
const { wantsJson } = require("./auth");
const META_404 = require("../routes/page-meta")["not-found"];

function notFound(req, res, next) {
  const err = new Error("Page not found");
  err.status = 404;
  err.expose = true;
  next(err);
}

// One error handler for the whole app. Messages are only shown to the user
// when the error was raised on purpose (expose); anything unexpected is
// logged with its stack and the user sees a generic message.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = Number(err.status || err.statusCode) || 500;
  if (err.code === "LIMIT_FILE_SIZE") status = 413;
  if (status >= 500) logger.error({ err, url: req.originalUrl }, "request failed");

  const message = err.expose || status < 500 ? err.message : "Something went wrong on our side. Please try again.";
  if (res.headersSent) return;
  res.status(status);

  if (req.originalUrl.startsWith("/admin") && wantsJson(req)) {
    return res.json({ error: message, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) });
  }
  const isAdmin = req.originalUrl.startsWith("/admin");
  const view = isAdmin ? "admin/error" : status === 404 ? "pages/not-found" : "public/error";
  const locals = isAdmin || status !== 404 ? { status, message } : { status, message, page: META_404 };
  return res.render(view, locals, (renderErr, html) => {
    if (renderErr) {
      logger.error({ err: renderErr }, "error view failed");
      return res.type("text").send(`${status} ${message}`);
    }
    return res.send(html);
  });
}

module.exports = { notFound, errorHandler };
