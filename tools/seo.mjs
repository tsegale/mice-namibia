// Dev-only: writes social/SEO meta into every page head (between
// <!-- seo:start --> / <!-- seo:end -->), plus sitemap.xml and robots.txt.
// Run it last, after any generator:  cd tools && node seo.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);
const { site_url: SITE } = JSON.parse(readFileSync(rel("content/data/conferences.json"), "utf8"));
const SKIP = new Set(["sponsors.html", "404.html"]); // redirect stub, error page
const DEFAULT_IMAGE = "assets/images/venues/wicc/gallery-05-1280.jpg";

const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
const urls = [];

for (const file of pages) {
  let html = readFileSync(rel(file), "utf8");
  html = html.replace(/\n?\s*<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, "");
  const noindex = /<meta name="robots" content="noindex">/.test(html);
  if (SKIP.has(file) || noindex) { writeFileSync(rel(file), html); continue; }

  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "MICE Namibia";
  const desc = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1] || "";
  const url = SITE + (file === "index.html" ? "" : file);
  const main = html.slice(html.indexOf("<main"));
  const img = (main.match(/<img src="(assets\/images\/(?!flags\/|sponsors\/|zusammen-logo)[^"]+\.jpg)"/) || [])[1] || DEFAULT_IMAGE;
  const type = file.startsWith("blog-") ? "article" : "website";
  const tags = [
    /rel="canonical"/.test(html) ? null : `<link rel="canonical" href="${url}">`,
    `<meta property="og:site_name" content="MICE Namibia">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${title.replace(/ \| MICE Namibia.*$/, "")}">`,
    desc && `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE}${img}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).map((t) => "  " + t).join("\n");
  const block = `\n  <!-- seo:start -->\n${tags}\n  <!-- seo:end -->`;
  const anchor = html.match(/  <meta name="description"[^>]*>/) || html.match(/  <title>[^<]*<\/title>/);
  html = html.replace(anchor[0], anchor[0] + block);
  writeFileSync(rel(file), html);
  const lastmod = statSync(rel(file)).mtime.toISOString().slice(0, 10);
  urls.push(`  <url><loc>${url}</loc><lastmod>${lastmod}</lastmod></url>`);
}

writeFileSync(rel("sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
writeFileSync(rel("robots.txt"), `User-agent: *\nDisallow: /team.html\n\nSitemap: ${SITE}sitemap.xml\n`);
console.log(`seo: ${urls.length} pages in sitemap`);
