"use strict";

const sanitizeHtml = require("sanitize-html");

// Rich text from the admin editor is cleaned on the server before it is
// stored, whatever the browser sent. Only the structure the article template
// is designed for survives; scripts, inline styles and event handlers never do.
const RICH_TEXT = {
  allowedTags: ["p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "b", "i", "u", "a", "blockquote", "br", "figure", "figcaption", "img"],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  transformTags: {
    b: "strong",
    i: "em",
    h1: "h2",
    a: (tagName, attribs) => {
      const href = attribs.href || "";
      const external = /^https?:\/\//i.test(href);
      const out = { href };
      if (attribs.title) out.title = attribs.title;
      if (external) {
        out.target = "_blank";
        out.rel = "noopener";
      }
      return { tagName, attribs: out };
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy" } }),
  },
  exclusiveFilter: (frame) => ["p", "li", "h2", "h3", "h4"].includes(frame.tag) && !frame.text.trim() && !frame.mediaChildren?.length,
};

function richText(html) {
  return sanitizeHtml(String(html || ""), RICH_TEXT).trim();
}

// FAQ answers are short: paragraphs, bold, italic, links and lists only.
// Same link handling as articles; headings, quotes and images are dropped
// (their text is kept).
const SHORT_TEXT = {
  ...RICH_TEXT,
  allowedTags: ["p", "ul", "ol", "li", "strong", "em", "b", "i", "a", "br"],
  allowedAttributes: { a: ["href", "title", "target", "rel"] },
  transformTags: { ...RICH_TEXT.transformTags, h1: "p", h2: "p", h3: "p", h4: "p", blockquote: "p" },
};

function shortText(html) {
  return sanitizeHtml(String(html || ""), SHORT_TEXT).trim();
}

// Plain-text fields: strip every tag.
function plain(text) {
  return sanitizeHtml(String(text || ""), { allowedTags: [], allowedAttributes: {} }).trim();
}

module.exports = { richText, shortText, plain };
