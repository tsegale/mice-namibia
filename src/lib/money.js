"use strict";

// Ticket prices are stored as integer cents with an ISO currency code and
// printed in one format everywhere: "N$ 1 250", or "N$ 1 250.50" when there
// are cents. The spaces are non-breaking so a price never wraps.

const SYMBOLS = { NAD: "N$", ZAR: "R", USD: "US$", EUR: "€" };
const CURRENCIES = Object.keys(SYMBOLS);
const NBSP = "\u00a0";
const MAX_CENTS = 100_000_000_00;

function formatPrice(cents, currency = "NAD") {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Not a price in cents: ${cents}`);
  const whole = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const rest = cents % 100;
  return `${SYMBOLS[currency] || currency}${NBSP}${whole}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}

// What an admin types ("1250", "1 250", "1,250", "1250.5") into cents.
// Returns null for an empty value and NaN for anything that is not a price.
function parseAmount(input) {
  let s = String(input ?? "").replace(/\s/g, "");
  if (!s) return null;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return cents > MAX_CENTS ? NaN : cents;
}

// Cents back into the admin's input box: "1250" or "1250.50".
function amountInput(cents) {
  if (cents == null) return "";
  return cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100);
}

module.exports = { formatPrice, parseAmount, amountInput, CURRENCIES, SYMBOLS };
