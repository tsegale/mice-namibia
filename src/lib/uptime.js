"use strict";

// Decision logic for scripts/uptime-check.js, kept pure so it can be tested
// without a network, a mail server or a clock.
//
// state: { status: "up" | "down", failures: number, since: ISO string | null }
// probe: { ok: boolean, detail: string }
// Returns { state, alert: null | "down" | "recovered" }.
//
// An alert goes out only on a change: "down" after `threshold` failed checks
// in a row (one slow response never pages anyone), "recovered" on the first
// good check after a "down" alert. Nothing is sent while the state holds.

const DEFAULT_THRESHOLD = 2;

function initialState() {
  return { status: "up", failures: 0, since: null };
}

function nextState(previous, probe, now = new Date(), threshold = DEFAULT_THRESHOLD) {
  const prev = { ...initialState(), ...(previous || {}) };
  if (probe.ok) {
    if (prev.status === "down") return { state: { status: "up", failures: 0, since: now.toISOString() }, alert: "recovered" };
    return { state: { ...prev, failures: 0 }, alert: null };
  }
  const failures = prev.failures + 1;
  if (prev.status === "up" && failures >= threshold) {
    return { state: { status: "down", failures, since: now.toISOString() }, alert: "down" };
  }
  return { state: { ...prev, failures }, alert: null };
}

// /healthz answers 200 with {"status":"ok"} when everything is fine; any
// other status code or body counts as down.
function judge(statusCode, body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  if (statusCode === 200 && parsed?.status === "ok") return { ok: true, detail: "ok" };
  const summary = parsed ? JSON.stringify(parsed) : String(body || "").replace(/\s+/g, " ").slice(0, 120);
  return { ok: false, detail: `HTTP ${statusCode}${summary ? `: ${summary}` : ""}` };
}

module.exports = { nextState, judge, initialState, DEFAULT_THRESHOLD };
