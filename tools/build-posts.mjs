// Builds every place a blog post appears from content/data/posts.json, so post
// images and metadata "pull through everywhere" (client request, round 3).
//
// Usage, from tools/:  node build-posts.mjs
//
// Writes (only between <!-- posts:* --> / <!-- post:* --> markers, never by hand):
//   ../index.html      posts:home      latest 3 cards
//   ../services.html   posts:services  the 3 posts listed in placements.services
//   ../blog.html       posts:listing   featured newest post + grid (filterable)
//   ../blog-NN.html    post:meta       category + reading time in the header
//                      post:aside      contents, share links, recent posts, categories
//                      post:after      previous/next + related posts
//                      post:jsonld     schema.org BlogPosting
// It also gives every <h2> in an article a stable id for the contents list.
// No dependencies (image sizes are read from the JPEG headers).

import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => path.join(ROOT, p);
const data = JSON.parse(await readFile(rel("content/data/posts.json"), "utf8"));
const SITE = data.site_url;
const posts = [...data.posts].sort((a, b) => b.n - a.n); // newest first
const bySlug = Object.fromEntries(posts.map((p) => [p.slug, p]));

/* Helpers ----------------------------------------------------------------- */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) => s.toLowerCase().replace(/&[a-z]+;/g, "").replace(/<[^>]+>/g, "").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function jpegSize(file) {
  const b = readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error("no size: " + file);
}

function picture(base, { sizes, alt = "", lazy = true, indent = "" }) {
  const ws = [640, 1280, 1920].filter((w) => existsSync(rel(`${base}-${w}.jpg`)));
  if (!ws.length) throw new Error("no variants for " + base);
  const fw = ws.includes(1280) ? 1280 : ws[ws.length - 1];
  const [w, h] = jpegSize(rel(`${base}-${fw}.jpg`));
  const webp = ws.map((x) => `${base}-${x}.webp ${x}w`).join(", ");
  const jpg = ws.map((x) => `${base}-${x}.jpg ${x}w`).join(", ");
  return `${indent}<picture>
${indent}  <source type="image/webp" srcset="${webp}" sizes="${sizes}">
${indent}  <img src="${base}-${fw}.jpg" srcset="${jpg}" sizes="${sizes}" alt="${esc(alt)}" width="${w}" height="${h}"${lazy ? ' loading="lazy" decoding="async"' : ""}>
${indent}</picture>`;
}

const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="11 18 5 12 11 6"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.04 21.5h-.01a9.43 9.43 0 0 1-4.81-1.32l-.35-.2-3.57.94.95-3.48-.23-.36a9.42 9.42 0 0 1-1.44-5.02c0-5.21 4.24-9.45 9.46-9.45 2.53 0 4.9.99 6.69 2.78a9.4 9.4 0 0 1 2.77 6.69c0 5.21-4.24 9.45-9.46 9.45zm8.04-17.5A11.32 11.32 0 0 0 12.04.67C5.78.67.68 5.76.68 12.03c0 2 .52 3.96 1.52 5.68L.6 23.33l5.75-1.51a11.33 11.33 0 0 0 5.69 1.45h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.03-1.18-5.89-3.33-8.03z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>',
};

const readTime = (p) => `<span class="post-card-time">${ICON.clock}${p.reading_minutes} min read</span>`;
const searchText = (p) => esc(`${p.title} ${p.excerpt} ${p.category}`.toLowerCase());

function card(p, { sizes = "(max-width: 720px) 100vw, (max-width: 900px) 50vw, 380px", indent = "          ", filter = false } = {}) {
  const attrs = filter ? ` data-post data-category="${esc(p.category)}" data-search="${searchText(p)}"` : "";
  return `${indent}<article class="card post-card"${attrs}>
${indent}  <div class="card-media">
${picture(p.image.base, { sizes, alt: p.image.alt, indent: indent + "    " })}
${indent}  </div>
${indent}  <div class="card-body">
${indent}    <p class="post-card-meta"><span class="chip chip--category">${esc(p.category)}</span>${readTime(p)}</p>
${indent}    <h3><a href="${p.slug}.html" class="card-link">${esc(p.title)}</a></h3>
${indent}    <span class="post-card-more" aria-hidden="true">Read article ${ICON.arrow}</span>
${indent}  </div>
${indent}</article>`;
}

function featured(p, indent = "          ") {
  return `${indent}<article class="post-feature" data-post data-category="${esc(p.category)}" data-search="${searchText(p)}">
${indent}  <div class="post-feature-media">
${picture(p.image.base, { sizes: "(max-width: 900px) 100vw, 640px", alt: p.image.alt, lazy: false, indent: indent + "    " })}
${indent}  </div>
${indent}  <div class="post-feature-body">
${indent}    <p class="post-card-meta"><span class="chip chip--category">${esc(p.category)}</span>${readTime(p)}<span class="post-feature-flag">Latest article</span></p>
${indent}    <h2><a href="${p.slug}.html" class="card-link">${esc(p.title)}</a></h2>
${indent}    <p>${esc(p.excerpt)}</p>
${indent}    <span class="btn btn-primary" aria-hidden="true">Read article</span>
${indent}  </div>
${indent}</article>`;
}

function replaceBetween(html, name, inner, file) {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`markers ${name} missing in ${file}`);
  return html.slice(0, a + start.length) + "\n" + inner + "\n" + html.slice(b);
}

/* Homepage, services ------------------------------------------------------ */

let home = await readFile(rel("index.html"), "utf8");
home = replaceBetween(home, "posts:home", posts.slice(0, 3).map((p) => card(p)).join("\n"), "index.html");
await writeFile(rel("index.html"), home);
console.log("updated index.html");

let services = await readFile(rel("services.html"), "utf8");
services = replaceBetween(services, "posts:services", data.placements.services.map((s) => card(bySlug[s])).join("\n"), "services.html");
await writeFile(rel("services.html"), services);
console.log("updated services.html");

/* Blog listing ------------------------------------------------------------- */

let blog = await readFile(rel("blog.html"), "utf8");
const listing = `${featured(posts[0])}
          <div class="post-grid post-grid--listing">
${posts.slice(1).map((p) => card(p, { indent: "            ", filter: true })).join("\n")}
          </div>`;
blog = replaceBetween(blog, "posts:listing", listing, "blog.html");
const cats = [...new Set(posts.map((p) => p.category))].sort();
blog = replaceBetween(blog, "posts:categories",
  [`            <li><button type="button" class="chip-filter is-active" data-category="all" aria-pressed="true">All <span>${posts.length}</span></button></li>`,
   ...cats.map((c) => `            <li><button type="button" class="chip-filter" data-category="${esc(c)}" aria-pressed="false">${esc(c)} <span>${posts.filter((p) => p.category === c).length}</span></button></li>`)].join("\n"),
  "blog.html");
await writeFile(rel("blog.html"), blog);
console.log("updated blog.html");

/* Post pages ----------------------------------------------------------------- */

const asc = [...posts].sort((a, b) => a.n - b.n);

function related(p) {
  const same = posts.filter((q) => q.slug !== p.slug && q.category === p.category);
  const rest = posts.filter((q) => q.slug !== p.slug && q.category !== p.category)
    .sort((a, b) => Math.abs(a.n - p.n) - Math.abs(b.n - p.n));
  return [...same, ...rest].slice(0, 3);
}

function shareLinks(p) {
  const url = encodeURIComponent(`${SITE}${p.slug}.html`);
  const text = encodeURIComponent(p.title);
  return [
    ["LinkedIn", ICON.linkedin, `https://www.linkedin.com/sharing/share-offsite/?url=${url}`],
    ["X", ICON.x, `https://x.com/intent/post?url=${url}&amp;text=${text}`],
    ["WhatsApp", ICON.whatsapp, `https://wa.me/?text=${text}%20${url}`],
    ["Email", ICON.mail, `mailto:?subject=${text}&amp;body=${url}`],
  ].map(([n, i, h]) => `              <a href="${h}" class="share-link share-link--${n.toLowerCase()}"${n === "Email" ? "" : ' target="_blank" rel="noopener"'} aria-label="Share on ${n}">${i}</a>`).join("\n");
}

for (const p of asc) {
  const file = `${p.slug}.html`;
  let html = await readFile(rel(file), "utf8");

  // One-time layout conversion: article + sidebar, then a related band.
  if (!html.includes("<!-- post:aside:start -->")) {
    const open = '<div class="container article-content">';
    const a = html.indexOf(open);
    const closeSection = html.indexOf("</section>", a);
    let body = html.slice(a + open.length, html.lastIndexOf("</div>", closeSection));
    body = body.replace(/\s*<a href="blog\.html" class="back-link">[\s\S]*?<\/a>/, "");
    const converted = `<div class="container post-layout">
        <article class="article-content post-article">${body.replace(/\s+$/, "")}
        </article>
        <aside class="post-aside" aria-label="About this article">
<!-- post:aside:start -->
<!-- post:aside:end -->
        </aside>
      </div>
    </section>

    <section class="section section--mist post-after" aria-labelledby="related-title">
      <div class="container">
<!-- post:after:start -->
<!-- post:after:end -->
      </div>`;
    html = html.slice(0, a) + converted + html.slice(html.lastIndexOf("</div>", closeSection) + "</div>".length);
    html = html.replace(/(<h1>[\s\S]*?<\/h1>)/, "$1\n        <!-- post:meta:start -->\n        <!-- post:meta:end -->");
    html = html.replace("</head>", "  <!-- post:jsonld:start -->\n  <!-- post:jsonld:end -->\n</head>");
  }

  // Stable ids on the article's h2s for the contents list.
  const artStart = html.indexOf('<article class="article-content post-article">');
  const artEnd = html.indexOf("</article>", artStart);
  let article = html.slice(artStart, artEnd);
  const used = new Set();
  const toc = [];
  article = article.replace(/<h2(\s+id="[^"]*")?>([\s\S]*?)<\/h2>/g, (m, idAttr, inner) => {
    let id = idAttr ? idAttr.match(/id="([^"]*)"/)[1] : slugify(inner);
    while (used.has(id)) id += "-2";
    used.add(id);
    toc.push([id, inner.replace(/<[^>]+>/g, "")]);
    return `<h2 id="${id}">${inner}</h2>`;
  });
  html = html.slice(0, artStart) + article + html.slice(artEnd);

  html = replaceBetween(html, "post:meta",
    `        <p class="post-meta"><span class="chip chip--category">${esc(p.category)}</span>${readTime(p)}<span>Zusammen Travels MICE</span></p>`, file);

  const recent = posts.filter((q) => q.slug !== p.slug).slice(0, 4);
  const aside = `          <div class="post-aside-inner">
            <div class="post-share">
              <p class="post-aside-title">Share this article</p>
              <div class="post-share-links">
${shareLinks(p)}
              </div>
            </div>
            <div class="post-recent">
              <p class="post-aside-title">Recent articles</p>
              <ul>
${recent.map((q) => `                <li><a href="${q.slug}.html" class="post-recent-item">
${picture(q.image.base, { sizes: "88px", alt: "", indent: "                  " })}
                  <span><span class="post-recent-cat">${esc(q.category)}</span>${esc(q.title)}</span>
                </a></li>`).join("\n")}
              </ul>
            </div>
            <div class="post-cats">
              <p class="post-aside-title">Categories</p>
              <ul>
${cats.map((c) => `                <li><a href="blog.html?category=${encodeURIComponent(c)}" class="chip chip--category">${esc(c)}</a></li>`).join("\n")}
              </ul>
            </div>
${toc.length > 1 ? `            <nav class="post-toc" aria-label="Contents">
              <p class="post-aside-title">Contents</p>
              <ol data-toc>
${toc.map(([id, t]) => `                <li><a href="#${id}">${t}</a></li>`).join("\n")}
              </ol>
            </nav>` : ""}
          </div>`;
  html = replaceBetween(html, "post:aside", aside, file);

  const i = asc.indexOf(p);
  const prev = asc[i - 1];
  const next = asc[i + 1];
  const pn = (q, dir) => q ? `          <a href="${q.slug}.html" class="post-nav-item post-nav-item--${dir}">
${picture(q.image.base, { sizes: "120px", alt: "", indent: "            " })}
            <span><span class="post-nav-label">${dir === "prev" ? ICON.arrowLeft + "Previous article" : "Next article" + ICON.arrow}</span><span class="post-nav-title">${esc(q.title)}</span></span>
          </a>` : `          <span class="post-nav-item post-nav-item--empty" aria-hidden="true"></span>`;
  const after = `        <nav class="post-nav" aria-label="More articles">
${pn(prev, "prev")}
${pn(next, "next")}
        </nav>
        <div class="home-venues-head">
          <div>
            <p class="eyebrow"><span class="stripe" aria-hidden="true"></span>Keep reading</p>
            <h2 id="related-title">Related <em class="accent">articles</em></h2>
          </div>
          <a href="blog.html" class="text-link">All articles ${ICON.arrow}</a>
        </div>
        <div class="post-grid">
${related(p).map((q) => card(q)).join("\n")}
        </div>`;
  html = replaceBetween(html, "post:after", after, file);

  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.excerpt,
    image: `${SITE}${p.image.base}-1280.jpg`,
    url: `${SITE}${p.slug}.html`,
    articleSection: p.category,
    timeRequired: `PT${p.reading_minutes}M`,
    publisher: { "@type": "Organization", name: "Zusammen Tours and Travel Agency (MICE Department)", logo: { "@type": "ImageObject", url: `${SITE}assets/images/zusammen-logo.png` } },
  };
  html = replaceBetween(html, "post:jsonld", `  <script type="application/ld+json">${JSON.stringify(ld)}</script>`, file);

  await writeFile(rel(file), html);
  console.log("wrote", file, `(${toc.length} contents entries)`);
}
