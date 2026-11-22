"use strict";

// Uptime check for GET <BASE_URL>/healthz, run by cron every 5 minutes:
//
//   */5 * * * * /opt/cpanel/ea-nodejs22/bin/node /home/<cpuser>/<app>/scripts/uptime-check.js
//
// Emails MAIL_TO (from .env, so it works while the database is down) when the
// site has failed two checks in a row, and once more when it recovers. The
// state lives in BACKUP_DIR/uptime-state.json. Silent while nothing changes;
// a failed check is also written to stderr.
//
// This runs on the same server as the site, so it cannot report the whole
// server being offline. Pair it with an external monitor (DEPLOY.md).

const fs = require("node:fs");
const path = require("node:path");
const config = require("../src/config");
const mailer = require("../src/services/mailer");
const { nextState, judge, initialState } = require("../src/lib/uptime");

const TIMEOUT_MS = 15000;
const url = `${config.baseUrl}/healthz`;
const stateFile = path.join(config.backupDir, "uptime-state.json");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") console.error(`uptime-check: unreadable ${stateFile}, starting fresh (${err.message})`);
    return initialState();
  }
}

async function probe() {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "mice-uptime-check" } });
    return judge(res.status, await res.text());
  } catch (err) {
    return { ok: false, detail: err.name === "TimeoutError" ? `no answer within ${TIMEOUT_MS / 1000} s` : err.message };
  }
}

async function main() {
  const result = await probe();
  const { state, alert } = nextState(readState(), result);
  fs.writeFileSync(stateFile, JSON.stringify(state));
  if (!result.ok) console.error(`uptime-check: ${url} failed (${result.detail}), ${state.failures} in a row`);
  if (!alert) return;

  const down = alert === "down";
  const sent = await mailer.send({
    to: config.mail.to,
    subject: down ? `[MICE site DOWN] ${config.baseUrl}` : `[MICE site recovered] ${config.baseUrl}`,
    text: down
      ? `${url} failed ${state.failures} checks in a row.\nLast result: ${result.detail}\nChecked at ${state.since} (UTC).\n\nFirst step: run "npm run doctor" in the app folder on the server. DEPLOY.md, Troubleshooting, has the rest.`
      : `${url} answers normally again (${state.since} UTC).`,
  });
  if (sent.status !== "sent") {
    console.error(`uptime-check: could not send the ${alert} email (${sent.error})`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(`uptime-check failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mailer.close());
