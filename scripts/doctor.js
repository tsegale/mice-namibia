"use strict";

// npm run doctor: checks a server (or a laptop) is ready to run the site.
// Prints one PASS / WARN / FAIL line per check and exits 1 if anything
// failed. Safe to run at any time: it only reads, apart from one temporary
// file in UPLOADS_DIR (written and removed again) and an in-process copy of
// the app on a random local port to fetch robots.txt.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const results = [];
const tty = process.stdout.isTTY;
const paint = (code, text) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
const LABEL = { pass: paint(32, "PASS"), warn: paint(33, "WARN"), fail: paint(31, "FAIL") };

function report(level, name, detail = "") {
  results.push(level);
  console.log(`${LABEL[level]}  ${name}${detail ? `: ${detail}` : ""}`);
}

async function check(name, fn) {
  try {
    const outcome = await fn();
    if (outcome && typeof outcome === "object") report(outcome.level, name, outcome.detail);
    else report("pass", name, outcome || "");
  } catch (err) {
    report("fail", name, err.message);
  }
}

const warn = (detail) => ({ level: "warn", detail });
const fail = (detail) => ({ level: "fail", detail });

// Values people paste from docs and examples. A real secret is long random hex.
function looksLikePlaceholder(secret) {
  if (/change|placeholder|example|replace|your|secret|dummy|test|ci-only|todo|xxx/i.test(secret)) return true;
  return new Set(secret).size < 12;
}

async function main() {
  let config;
  try {
    config = require("../src/config");
    report("pass", "Settings load", `NODE_ENV=${config.env}, SITE_ENV=${config.siteEnv}`);
  } catch (err) {
    report("fail", "Settings load", err.message);
    return;
  }

  // Keep request logs and driver warnings out of the checklist: every
  // problem they would show is reported as a FAIL line below.
  require("../src/lib/logger").level = "error";
  const { db, destroy } = require("../src/db/knex");
  const { pendingMigrations, withTimeout } = require("../src/lib/health");

  try {
    let dbUp = false;
    await check("Database reachable", async () => {
      await withTimeout(db().raw("SELECT 1"), 8000, "connecting");
      dbUp = true;
      return `${config.db.database} on ${config.db.host}:${config.db.port}`;
    });

    if (dbUp) {
      await check("No pending migrations", async () => {
        const pending = await pendingMigrations(db());
        return pending.length ? fail(`${pending.join(", ")} (run npm run migrate)`) : "all applied";
      });
      await check("Active admin account", async () => {
        if (!(await db().schema.hasTable("admin_users"))) return fail("admin_users table missing (run npm run migrate)");
        const [{ n }] = await db()("admin_users").where({ role: "admin", is_active: true }).count({ n: "*" });
        return Number(n) > 0 ? `${n} active` : fail("none (run npm run create-admin)");
      });
    } else {
      report("fail", "No pending migrations", "skipped, database unreachable");
      report("fail", "Active admin account", "skipped, database unreachable");
    }

    await check("UPLOADS_DIR writable", () => writableDir(config.uploads.dir, { required: true }));
    await check("BACKUP_DIR writable", () => writableDir(config.backupDir, { required: false }));

    await check("sharp encodes WebP", async () => {
      const sharp = require("sharp");
      const out = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#EF8621" } }).webp().toBuffer();
      if (out.subarray(8, 12).toString() !== "WEBP") return fail("output is not WebP");
      return `sharp ${sharp.versions?.sharp || ""}, libvips ${sharp.versions?.vips || ""}`.trim();
    });

    await check("SMTP login", async () => {
      if (!config.mail.enabled) return warn("not configured (SMTP_HOST/SMTP_USER empty); enquiries are saved but not emailed");
      const mailer = require("../src/services/mailer");
      try {
        await withTimeout(mailer.verify(), 25000, "SMTP login");
      } finally {
        mailer.close();
      }
      if (!config.mail.to) return warn(`login OK as ${config.mail.user}, but MAIL_TO is empty`);
      return `login OK as ${config.mail.user}`;
    });

    if (config.isProd) {
      await check("BASE_URL uses https", () => (config.baseUrl.startsWith("https://") ? config.baseUrl : fail(`${config.baseUrl} (cookies are secure-only in production)`)));
      await check("SESSION_SECRET is real", () =>
        looksLikePlaceholder(config.session.secret) ? fail("looks like a placeholder; generate one with node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"") : `${config.session.secret.length} characters`
      );
      await check("TRUST_PROXY on", () => (/^(true|1)$/.test(process.env.TRUST_PROXY || "") ? "true" : fail("set TRUST_PROXY=true (Passenger terminates TLS in front of Node)")));
    } else {
      report("warn", "Production checks", `skipped, NODE_ENV=${config.env}`);
    }

    if (dbUp) await check("robots.txt matches SITE_ENV", () => robotsCheck(config));
    else report("fail", "robots.txt matches SITE_ENV", "skipped, database unreachable");
  } finally {
    await destroy();
  }
}

async function writableDir(dir, { required }) {
  if (!fs.existsSync(dir)) {
    const msg = `${dir} does not exist`;
    return required ? fail(msg) : warn(`${msg} (scripts/backup.sh creates it)`);
  }
  if (!fs.statSync(dir).isDirectory()) return fail(`${dir} is not a folder`);
  const probe = path.join(dir, `.doctor-${crypto.randomBytes(4).toString("hex")}`);
  try {
    fs.writeFileSync(probe, "ok");
  } catch (err) {
    return required ? fail(`${dir}: ${err.code || err.message}`) : warn(`${dir}: ${err.code || err.message}`);
  }
  fs.rmSync(probe, { force: true });
  return dir;
}

// Boots the real app on a random local port and reads /robots.txt, so a
// stray public/robots.txt (served before the route) is caught as well.
async function robotsCheck(config) {
  const { createApp } = require("../src/app");
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s)).on("error", reject);
  });
  try {
    const headers = config.stagingBasicAuth ? { authorization: `Basic ${Buffer.from(config.stagingBasicAuth).toString("base64")}` } : {};
    const res = await fetch(`http://127.0.0.1:${server.address().port}/robots.txt`, { headers });
    if (res.status !== 200) return fail(`GET /robots.txt returned ${res.status}`);
    const blocksAll = /^Disallow:\s*\/\s*$/m.test(await res.text());
    const noindexHeader = /noindex/.test(res.headers.get("x-robots-tag") || "");
    if (config.siteEnv === "production") {
      if (blocksAll || noindexHeader) return fail("SITE_ENV=production but robots.txt or X-Robots-Tag still blocks search engines");
      return "production: indexable, /admin disallowed";
    }
    if (!blocksAll) return fail(`SITE_ENV=${config.siteEnv} but robots.txt does not say "Disallow: /"`);
    if (!noindexHeader) return fail(`SITE_ENV=${config.siteEnv} but the X-Robots-Tag noindex header is missing`);
    return `${config.siteEnv}: Disallow: / and noindex`;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.locals.close();
  }
}

main()
  .catch((err) => report("fail", "Doctor crashed", err.message))
  .finally(() => {
    const count = (l) => results.filter((r) => r === l).length;
    console.log(`\n${count("pass")} passed, ${count("warn")} warnings, ${count("fail")} failed`);
    process.exitCode = count("fail") ? 1 : 0;
  });
