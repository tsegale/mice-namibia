"use strict";

// Phase 2A step 1: the public site is still the reviewed static build, served
// by this app from the same origin as the admin. Pages move to EJS templates
// rendered from the database step by step; until a page is ported it is
// served from its .html file here.

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const config = require("../config");

const router = express.Router();
const LEGACY_DIR = config.root;
const LEGACY_PAGES = new Set(
  fs
    .readdirSync(LEGACY_DIR)
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.replace(/\.html$/, ""))
);

const cache = new Map();
function readPage(name) {
  if (config.isProd && cache.has(name)) return cache.get(name);
  const html = fs.readFileSync(path.join(LEGACY_DIR, `${name}.html`), "utf8");
  if (config.isProd) cache.set(name, html);
  return html;
}

function sendLegacy(name, req, res) {
  // The only inline script on the static pages (adds the "js" class) gets this
  // request's CSP nonce.
  const html = readPage(name).replace(/<script>(?=document\.documentElement\.classList\.add)/g, `<script nonce="${res.locals.cspNonce}">`);
  res.type("html").send(html);
}

router.get("/", (req, res) => sendLegacy("index", req, res));

router.get("/:page", (req, res, next) => {
  const name = req.params.page.replace(/\.html$/, "");
  if (name === "index" || !LEGACY_PAGES.has(name) || name === "404") return next();
  return sendLegacy(name, req, res);
});

module.exports = router;
