"use strict";

// "Paste URL" in the image picker: the server downloads the image once and
// stores it like an upload, so the site never hotlinks someone else's file
// (hotlinked images break the day the other site moves them).
//
// The download is guarded against server-side request forgery: only http(s),
// only public IP addresses (checked at connect time, so DNS rebinding cannot
// slip through), a size cap, a timeout and at most three redirects.

const http = require("node:http");
const https = require("node:https");
const dns = require("node:dns");
const net = require("node:net");
const config = require("../config");
const { UploadError } = require("./images");

const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || !list.length) return callback(new UploadError("That address points to a private network and cannot be used."));
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

function get(url, redirectsLeft) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new UploadError("That does not look like a web address."));
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return reject(new UploadError("Only http:// and https:// links can be imported."));
    if (net.isIP(parsed.hostname) && isPrivateAddress(parsed.hostname)) return reject(new UploadError("That address points to a private network and cannot be used."));

    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(parsed, { lookup: safeLookup, timeout: TIMEOUT_MS, headers: { "User-Agent": "MICE-Namibia-Admin/1.0", Accept: "image/*" } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new UploadError("That link redirects too many times."));
        return resolve(get(new URL(res.headers.location, parsed).toString(), redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new UploadError(`The image could not be downloaded (the other site answered ${res.statusCode}).`));
      }
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > config.uploads.maxBytes) {
          req.destroy(new UploadError(`Images must be smaller than ${Math.round(config.uploads.maxBytes / 1024 / 1024)} MB.`, 413));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ buffer: Buffer.concat(chunks), name: decodeURIComponent(parsed.pathname.split("/").pop() || "image") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new UploadError("The other site took too long to send the image.")));
    req.on("error", (err) => reject(err instanceof UploadError ? err : new UploadError("The image could not be downloaded. Check the link and try again.")));
  });
}

function download(url) {
  return get(String(url || "").trim(), MAX_REDIRECTS);
}

module.exports = { download, isPrivateAddress };
