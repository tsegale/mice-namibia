"use strict";

const pino = require("pino");
const config = require("../config");

function usePretty() {
  if (config.isProd || config.isTest) return false;
  try {
    require.resolve("pino-pretty");
    return true;
  } catch {
    // Not installed (production-style install): fall back to JSON lines.
    return false;
  }
}

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
  // Production: one JSON object per line on stdout, which Passenger captures
  // into its log file. Pretty output is a development nicety only, and only
  // when pino-pretty is installed (npm ci --omit=dev leaves it out).
  ...(usePretty() ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } } } : {}),
});

module.exports = logger;
