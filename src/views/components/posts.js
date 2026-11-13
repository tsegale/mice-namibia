"use strict";

// Blog markup for the homepage, Services, the Blog listing and article
// pages. Ported 1:1 from tools/build-posts.mjs, now fed from the database.

const { escapeHtml: esc, slugify } = require("../../lib/text");
const { picture, largestUrl } = require("../../lib/picture");
const { POST: ICON } = require("./icons");

const readTime = (p) => `<span class="post-card-time">${ICON.clock}${p.reading_minutes} min read</span>`;
const searchText = (p) => esc(`${p.title} ${p.excerpt} ${p.category || ""}`.toLowerCase());

function card(p, { sizes = "(max-width: 720px) 100vw, (max-width: 900px) 50vw, 380px", filter = false } = {}) {
  const attrs = filter ? ` data-post data-category="${esc(p.category || "")}" data-search="${searchText(p)}"` : "";
  return `<article class="card post-card"${attrs}>
  <div class="card-media">
    ${picture(p.cover, { sizes, alt: p.cover_alt })}
  </div>
  <div class="card-body">
    <p class="post-card-meta"><span class="chip chip--category">${esc(p.category || "")}</span>${readTime(p)}</p>
    <h3><a href="${p.url}" class="card-link">${esc(p.title)}</a></h3>
    <span class="post-card-more" aria-hidden="true">Read article ${ICON.arrow}</span>
  </div>
</article>`;
}

function featured(p) {
  return `<article class="post-feature" data-post data-category="${esc(p.category || "")}" data-search="${searchText(p)}">
  <div class="post-feature-media">
    ${picture(p.cover, { sizes: "(max-width: 900px) 100vw, 640px", alt: p.cover_alt, lazy: false })}
  </div>
  <div class="post-feature-body">
    <p class="post-card-meta"><span class="chip chip--category">${esc(p.category || "")}</span>${readTime(p)}<span class="post-feature-flag">Latest article</span></p>
    <h2><a href="${p.url}" class="card-link">${esc(p.title)}</a></h2>
    <p>${esc(p.excerpt)}</p>
    <span class="btn btn-primary" aria-hidden="true">Read article</span>
  </div>
</article>`;
}

function cards(posts, opts) {
  return posts.map((p) => card(p, opts)).join("\n");
}

function listing(posts) {
  if (!posts.length) return '<p class="conference-empty-title">New articles are on their way.</p>';
  return `${featured(posts[0])}
<div class="post-grid post-grid--listing">
${posts.slice(1).map((p) => card(p, { filter: true })).join("\n")}
</div>`;
}

function categoryFilters(posts) {
  const cats = [...new Set(posts.map((p) => p.category).filter(Boolean))].sort();
  return [
    `<li><button type="button" class="chip-filter is-active" data-category="all" aria-pressed="true">All <span>${posts.length}</span></button></li>`,
    ...cats.map((c) => `<li><button type="button" class="chip-filter" data-category="${esc(c)}" aria-pressed="false">${esc(c)} <span>${posts.filter((p) => p.category === c).length}</span></button></li>`),
  ].join("\n");
}

// Gives every <h2> a stable id and returns the contents list.
function withHeadingIds(html) {
  const used = new Set();
  const toc = [];
  const body = String(html).replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g, (m, attrs, inner) => {
    let id = slugify(inner.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"), 60) || "section";
    while (used.has(id)) id += "-2";
    used.add(id);
    toc.push([id, inner.replace(/<[^>]+>/g, "")]);
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { body, toc };
}

function shareLinks(p, baseUrl) {
  const url = encodeURIComponent(baseUrl + p.url);
  const text = encodeURIComponent(p.title);
  return [
    ["LinkedIn", ICON.linkedin, `https://www.linkedin.com/sharing/share-offsite/?url=${url}`],
    ["X", ICON.x, `https://x.com/intent/post?url=${url}&amp;text=${text}`],
    ["WhatsApp", ICON.whatsapp, `https://wa.me/?text=${text}%20${url}`],
    ["Email", ICON.mail, `mailto:?subject=${text}&amp;body=${url}`],
  ]
    .map(([n, i, h]) => `<a href="${h}" class="share-link share-link--${n.toLowerCase()}"${n === "Email" ? "" : ' target="_blank" rel="noopener"'} aria-label="Share on ${n}">${i}</a>`)
    .join("\n");
}

function aside(p, { all, toc, baseUrl }) {
  const recent = all.filter((q) => q.id !== p.id).slice(0, 4);
  const cats = [...new Set(all.map((q) => q.category).filter(Boolean))].sort();
  return `<div class="post-aside-inner">
  <div class="post-share">
    <p class="post-aside-title">Share this article</p>
    <div class="post-share-links">
${shareLinks(p, baseUrl)}
    </div>
  </div>
  <div class="post-recent">
    <p class="post-aside-title">Recent articles</p>
    <ul>
${recent
  .map(
    (q) => `      <li><a href="${q.url}" class="post-recent-item">
        ${picture(q.cover, { sizes: "88px", alt: "" })}
        <span><span class="post-recent-cat">${esc(q.category || "")}</span>${esc(q.title)}</span>
      </a></li>`
  )
  .join("\n")}
    </ul>
  </div>
  <div class="post-cats">
    <p class="post-aside-title">Categories</p>
    <ul>
${cats.map((c) => `      <li><a href="/blog?category=${encodeURIComponent(c)}" class="chip chip--category">${esc(c)}</a></li>`).join("\n")}
    </ul>
  </div>
${
  toc.length > 1
    ? `  <nav class="post-toc" aria-label="Contents">
    <p class="post-aside-title">Contents</p>
    <ol data-toc>
${toc.map(([id, t]) => `      <li><a href="#${id}">${t}</a></li>`).join("\n")}
    </ol>
  </nav>`
    : ""
}
</div>`;
}

function related(p, all) {
  const same = all.filter((q) => q.id !== p.id && q.category === p.category);
  const idx = (q) => all.indexOf(q);
  const rest = all.filter((q) => q.id !== p.id && q.category !== p.category).sort((a, b) => Math.abs(idx(a) - idx(p)) - Math.abs(idx(b) - idx(p)));
  return [...same, ...rest].slice(0, 3);
}

function after(p, all) {
  // all is newest first; "previous" is the older article, "next" the newer.
  const i = all.findIndex((q) => q.id === p.id);
  const prev = all[i + 1];
  const next = all[i - 1];
  const pn = (q, dir) =>
    q
      ? `<a href="${q.url}" class="post-nav-item post-nav-item--${dir}">
  ${picture(q.cover, { sizes: "120px", alt: "" })}
  <span><span class="post-nav-label">${dir === "prev" ? ICON.arrowLeft + "Previous article" : "Next article" + ICON.arrow}</span><span class="post-nav-title">${esc(q.title)}</span></span>
</a>`
      : `<span class="post-nav-item post-nav-item--empty" aria-hidden="true"></span>`;
  return `<nav class="post-nav" aria-label="More articles">
${pn(prev, "prev")}
${pn(next, "next")}
</nav>
<div class="home-venues-head">
  <div>
    <p class="eyebrow"><span class="stripe" aria-hidden="true"></span>Keep reading</p>
    <h2 id="related-title">Related <em class="accent">articles</em></h2>
  </div>
  <a href="/blog" class="text-link">All articles ${ICON.arrow}</a>
</div>
<div class="post-grid">
${cards(related(p, all))}
</div>`;
}

function meta(p) {
  return `<p class="post-meta"><span class="chip chip--category">${esc(p.category || "")}</span>${readTime(p)}<span>${esc(p.author_name)}</span></p>`;
}

// publisher: the copyright holder from Admin > Settings > Footer.
function jsonLd(p, baseUrl, publisher) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.excerpt,
    image: p.cover ? baseUrl + largestUrl(p.cover) : undefined,
    url: baseUrl + p.url,
    datePublished: p.published_at ? new Date(p.published_at).toISOString() : undefined,
    dateModified: p.updated_at ? new Date(p.updated_at).toISOString() : undefined,
    articleSection: p.category || undefined,
    timeRequired: `PT${p.reading_minutes}M`,
    author: { "@type": "Organization", name: p.author_name },
    publisher: { "@type": "Organization", name: publisher, logo: { "@type": "ImageObject", url: `${baseUrl}/assets/images/zusammen-logo.png` } },
  }).replace(/</g, "\\u003c");
}

module.exports = { card, cards, featured, listing, categoryFilters, withHeadingIds, aside, after, meta, jsonLd };
