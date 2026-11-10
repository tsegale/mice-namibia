"use strict";

// Single place that reads the environment. Everything else imports this module,
// never process.env directly.
//
// Zusammen lessons applied here:
// - .env is loaded by absolute path from the project root, so it works no matter
//   which directory cPanel/Passenger starts the process from ("fix dotenv").
// - Every required value is validated at boot and the app refuses to start with
//   a clear message, instead of silently falling back to defaults such as
//   "admin123" or a hard-coded session secret.

const path = require("node:path");
const { z } = require("zod");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SITE_ENV: z.enum(["local", "staging", "production"]).default("local"),
  PORT: z.coerce.number().int().positive().default(3000),
  BASE_URL: z.url().default("http://localhost:3000"),

  DB_HOST: z.string().min(1).default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(""),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters (use a long random string)"),
  TRUST_PROXY: bool,

  UPLOADS_DIR: z.string().default("storage/uploads"),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(12),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  MAIL_FROM: z.string().default(""),
  MAIL_TO: z.string().default(""),

  STAGING_BASIC_AUTH: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

function load(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    const err = new Error(`Invalid environment configuration (check .env):\n${lines.join("\n")}`);
    err.code = "CONFIG_INVALID";
    throw err;
  }
  const c = parsed.data;
  const isProd = c.NODE_ENV === "production";
  return {
    root: ROOT,
    env: c.NODE_ENV,
    isProd,
    isTest: c.NODE_ENV === "test",
    siteEnv: c.SITE_ENV,
    port: c.PORT,
    baseUrl: c.BASE_URL.replace(/\/$/, ""),
    db: {
      host: c.DB_HOST,
      port: c.DB_PORT,
      database: c.DB_NAME,
      user: c.DB_USER,
      password: c.DB_PASSWORD,
    },
    session: {
      secret: c.SESSION_SECRET,
      // Behind cPanel/Passenger (or any proxy) TLS terminates before Node, so
      // Express must trust the proxy for secure cookies and real client IPs.
      trustProxy: c.TRUST_PROXY || isProd,
      secureCookie: isProd,
    },
    uploads: {
      dir: path.resolve(ROOT, c.UPLOADS_DIR),
      maxBytes: Math.round(c.UPLOAD_MAX_MB * 1024 * 1024),
    },
    mail: {
      host: c.SMTP_HOST,
      port: c.SMTP_PORT,
      secure: c.SMTP_SECURE || c.SMTP_PORT === 465,
      user: c.SMTP_USER,
      pass: c.SMTP_PASS,
      from: c.MAIL_FROM || c.SMTP_USER,
      to: c.MAIL_TO,
      enabled: Boolean(c.SMTP_HOST && c.SMTP_USER),
    },
    stagingBasicAuth: c.STAGING_BASIC_AUTH,
    logLevel: c.NODE_ENV === "test" ? "silent" : c.LOG_LEVEL,
  };
}

const config = load();
Object.defineProperty(config, "load", { value: load, enumerable: false });
module.exports = Object.freeze(config);
