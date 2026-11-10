"use strict";

const pino = require("pino");
const config = require("../config");

// Structured logs. Secrets are redacted (Zusammen printed the login email and
// password-check result to the console on every attempt).
const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.headers['x-csrf-token']",
      "res.headers['set-cookie']",
      "*.password",
      "*.password_hash",
      "*.pass",
    ],
    censor: "[redacted]",
  },
  ...(config.isProd || config.isTest
    ? {}
    : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }),
});

module.exports = logger;
