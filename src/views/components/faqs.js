"use strict";

const { escapeHtml: esc } = require("../../lib/text");

// The answer is stored as cleaned rich text. A one-paragraph answer renders
// as the original <p class="faq-answer">; longer ones (several paragraphs or
// a list) get a <div> with the same class.
function answer(html) {
  const single = /^<p>((?:(?!<\/?p[ >])[\s\S])*)<\/p>$/.exec(String(html || "").trim());
  return single ? `<p class="faq-answer">${single[1]}</p>` : `<div class="faq-answer">${html}</div>`;
}

const flag = (iso) => (iso ? `<img class="faq-flag" src="/assets/images/flags/${esc(iso)}.svg" alt="" width="24" height="18">` : "");

// FAQ page item: flag (destination questions), searchable question text.
function pageItem(f) {
  return `<details class="faq-item"${f.country_iso2 ? ` data-country="${esc(f.country_iso2)}"` : ""}>
  <summary class="faq-question">${flag(f.country_iso2)}<span class="faq-q-text">${esc(f.question)}</span><span class="faq-icon"></span></summary>
  ${answer(f.answer)}
</details>`;
}

// Homepage preview item: question text only.
function homeItem(f) {
  return `<details class="faq-item">
  <summary class="faq-question">${esc(f.question)}<span class="faq-icon"></span></summary>
  ${answer(f.answer)}
</details>`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function group(g) {
  const id = `faq-${esc(g.slug)}`;
  return `<section class="faq-group" id="${id}" aria-labelledby="${id}-title" data-faq-group>
  <div class="faq-group-head">
    <h3 id="${id}-title">${esc(g.name)}</h3>
    <span class="faq-group-count">${plural(g.faqs.length, "question", "questions")}</span>
  </div>
  <div class="faq-list">
    ${g.faqs.map(pageItem).join("\n")}
  </div>
</section>`;
}

function jumps(groups) {
  return groups.map((g) => `<li><a href="#faq-${esc(g.slug)}" class="faq-jump">${esc(g.name)} <span>${g.faqs.length}</span></a></li>`).join("\n");
}

const plainText = (html) =>
  String(html || "")
    .replace(/<\/(p|li)>/g, "$& ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// schema.org FAQPage, from the same published questions as the page.
function jsonLd(groups) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) => g.faqs).map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: plainText(f.answer) },
    })),
  }).replace(/</g, "\u003c");
}

module.exports = { answer, pageItem, homeItem, group, jumps, jsonLd, plainText };
