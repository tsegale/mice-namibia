"use strict";

// Word-level diff for the legal documents (Admin > Legal: a new version
// against the current one). Myers' O(ND) algorithm over word and whitespace
// tokens, so similar documents of a few thousand words diff in milliseconds.

// Past this many word edits the texts are treated as rewritten: the result
// is "all removed, all added" (keeps memory bounded, about 16 MB at most).
const MAX_EDITS = 2000;

const tokenize = (text) => String(text).replace(/\r\n?/g, "\n").match(/\s+|[^\s]+/g) || [];

// Returns [{ op: "same" | "add" | "del", text }], adjacent runs merged.
function diffWords(before, after) {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    if (d > MAX_EDITS) return [...(n ? [{ op: "del", text: a.join("") }] : []), ...(m ? [{ op: "add", text: b.join("") }] : [])];
    // Only diagonals -d..d can be read at this step: keep just that band.
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  // Walk the trace back from the end to recover the edit script.
  const ops = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const band = trace[d];
    const at = (diag) => band[diag + d];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      ops.push({ op: "same", text: a[x] });
    }
    if (d > 0) {
      if (x === prevX) ops.push({ op: "add", text: b[--y] });
      else ops.push({ op: "del", text: a[--x] });
    }
  }
  ops.reverse();

  const merged = [];
  for (const o of ops) {
    const last = merged[merged.length - 1];
    if (last && last.op === o.op) last.text += o.text;
    else merged.push({ ...o });
  }
  return merged;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// HTML for the admin preview: <ins>/<del> marks, unchanged stretches longer
// than `context` words shortened to their ends.
function diffHtml(before, after, { context = 40 } = {}) {
  const parts = diffWords(before, after);
  const changes = parts.filter((p) => p.op !== "same");
  const added = changes.filter((p) => p.op === "add").reduce((n, p) => n + (p.text.match(/[^\s]+/g) || []).length, 0);
  const removed = changes.filter((p) => p.op === "del").reduce((n, p) => n + (p.text.match(/[^\s]+/g) || []).length, 0);
  const html = parts
    .map((p, i) => {
      if (p.op === "add") return `<ins>${esc(p.text)}</ins>`;
      if (p.op === "del") return `<del>${esc(p.text)}</del>`;
      const words = p.text.match(/\s+|[^\s]+/g) || [];
      const wordCount = words.filter((w) => /\S/.test(w)).length;
      if (wordCount <= context * 2) return esc(p.text);
      const head = i === 0 ? [] : takeWords(words, context);
      const tail = i === parts.length - 1 ? [] : takeWords([...words].reverse(), context).reverse();
      return `${esc(head.join(""))}<span class="diff-gap">[${wordCount - head.filter((w) => /\S/.test(w)).length - tail.filter((w) => /\S/.test(w)).length} unchanged words]</span>${esc(tail.join(""))}`;
    })
    .join("");
  return { html, added, removed, changed: changes.length > 0 };
}

function takeWords(tokens, count) {
  const out = [];
  let words = 0;
  for (const t of tokens) {
    if (/\S/.test(t)) {
      if (words === count) break;
      words++;
    }
    out.push(t);
  }
  return out;
}

module.exports = { diffWords, diffHtml, tokenize };
