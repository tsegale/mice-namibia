"use strict";

// The version string appended to CSS and JS links (?v=...), so a deploy never
// leaves visitors on yesterday's cached stylesheet. It is the short git commit
// of the checkout the app runs from, read from .git directly (cPanel's
// Passenger environment may not have the git binary on its PATH). Without a
// .git folder it falls back to the package.json version.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

function readGitSha(root = ROOT) {
  try {
    const gitDir = path.join(root, ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head.slice(0, 7);
    const ref = /^ref: (.+)$/.exec(head)?.[1];
    if (!ref) return null;
    const loose = path.join(gitDir, ref);
    if (fs.existsSync(loose)) return fs.readFileSync(loose, "utf8").trim().slice(0, 7);
    const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
    const line = packed.split("\n").find((l) => l.endsWith(` ${ref}`));
    return line ? line.slice(0, 7) : null;
  } catch {
    // No .git folder (e.g. a copied release): use the package version instead.
    return null;
  }
}

function assetVersion(root = ROOT) {
  return readGitSha(root) || require(path.join(root, "package.json")).version;
}

module.exports = { assetVersion, readGitSha };
