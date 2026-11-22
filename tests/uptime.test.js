"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nextState, judge, initialState } = require("../src/lib/uptime");

const ok = { ok: true, detail: "ok" };
const bad = { ok: false, detail: "HTTP 503" };
const t0 = new Date("2026-11-22T10:00:00Z");

test("uptime: a single failed check does not alert", () => {
  const r = nextState(initialState(), bad, t0);
  assert.equal(r.alert, null);
  assert.deepEqual(r.state, { status: "up", failures: 1, since: null });
});

test("uptime: two failures in a row alert once, then stay quiet", () => {
  let r = nextState(initialState(), bad, t0);
  r = nextState(r.state, bad, t0);
  assert.equal(r.alert, "down");
  assert.equal(r.state.status, "down");
  assert.equal(r.state.since, t0.toISOString());
  r = nextState(r.state, bad, t0);
  assert.equal(r.alert, null, "no repeat while still down");
  assert.equal(r.state.failures, 3);
});

test("uptime: recovery after a down alert alerts once", () => {
  const down = { status: "down", failures: 4, since: t0.toISOString() };
  let r = nextState(down, ok, t0);
  assert.equal(r.alert, "recovered");
  assert.deepEqual(r.state, { status: "up", failures: 0, since: t0.toISOString() });
  r = nextState(r.state, ok, t0);
  assert.equal(r.alert, null);
});

test("uptime: a good check resets a failure that never alerted", () => {
  const r = nextState({ status: "up", failures: 1, since: null }, ok, t0);
  assert.equal(r.alert, null);
  assert.equal(r.state.failures, 0);
});

test("uptime: missing or partial state is treated as up", () => {
  assert.equal(nextState(null, bad, t0).state.failures, 1);
  assert.equal(nextState({}, ok, t0).alert, null);
});

test("uptime: judge accepts only 200 with status ok", () => {
  assert.equal(judge(200, '{"status":"ok","db":"ok","migrations":"ok"}').ok, true);
  const pending = judge(503, '{"status":"error","db":"ok","migrations":"pending"}');
  assert.equal(pending.ok, false);
  assert.match(pending.detail, /^HTTP 503: .*pending/);
  assert.equal(judge(200, "<html>maintenance</html>").ok, false, "a 200 that is not the health JSON is down");
  assert.match(judge(502, "<html>\n  Bad   Gateway</html>").detail, /^HTTP 502: <html> Bad Gateway/);
});
