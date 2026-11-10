"use strict";

const logger = require("../lib/logger");
const { wantsJson } = require("./auth");

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
  const view = req.originalUrl.startsWith("/admin") ? "admin/error" : "public/error";
  return res.render(view, { status, message }, (renderErr, html) => {
    if (renderErr) {
      logger.error({ err: renderErr }, "error view failed");
      return res.type("text").send(`${status} ${message}`);
    }
    return res.send(html);
  });
}

module.exports = { notFound, errorHandler };
