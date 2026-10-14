# MICE Namibia - Round 3 Claude Code prompts

Source: Macedo's email of 7 Oct 2026 ("Re: Handover of MICE Website"), plus the backend
requirements in his original handover specs (`content/specs/03`, `05`, `06`).

Run these in order, one per Claude Code session, from the `mice-namibia` folder.
They are big, so for each one: switch Claude Code to **plan mode** (Shift+Tab), paste
the prompt, review the plan it proposes, then let it execute. Commit after each one
with the message underneath it.

## Before you start (5 minutes)

1. **Legal text is already in the project.** Last round's legal prompt went out with
   bracketed placeholders instead of the real clauses (my mistake), which is why Macedo
   says the Terms and policies are missing. The verbatim text from his Drive docs is now
   in `content/legal/privacy-policy.md` and `content/legal/terms-and-conditions.md`.
2. **Download Macedo's "IMAGES AND CONFERENCES" Drive link** (from his 7 Oct email) and
   put its contents here:
   - the 3 conferences' images and any text/docs → `content/conferences/`
   - the revised logo → `content/brand/`
   If the link has no write-up for the conferences, Prompt 1 seeds nothing and the
   section shows its empty state until Macedo adds them in the admin (Prompt 4).
3. **Install** Node 20 LTS and either Docker Desktop (easiest, Prompt 1 adds a
   `docker-compose.yml` with MariaDB) or XAMPP's MariaDB.
4. **After Prompt 1 is pushed:** GitHub → repo Settings → Pages → Source: `master`
   branch, folder `/docs`. The review link stays the same.

Order: 1 Backend foundation → 2 Design system + homepage → 3 Inner pages + Macedo's
fixes → 4 Admin CMS → 5 Deploy, SEO, docs. After Prompt 3 you can send Macedo the
preview link; after Prompt 5 he gets an admin login on staging.

---

## Prompt 1 - Backend foundation (Express + MySQL, no visual changes yet)

```
This static site has to become a database-driven Node app. The client (Macedo, Zusammen
Tours and Travel Agency's MICE segment) needs to edit conferences, blog posts, speakers,
venues and every other content section himself from a backend. Read CLAUDE.md and
content/specs/03-events-spec.pdf, 05-blogs-spec.pdf and 06-venues-spec.pdf first; the
backend requirements are written in those specs.

Goal of THIS step: port the existing site 1:1 onto Express + EJS + MySQL with a complete
data model and seeded content. Do not redesign anything yet; the rendered pages should look
the same as now so the port is reviewable. Design and admin come in later steps.

STACK (this is the same pattern as our other Zusammen/Pack client builds, keep it
cPanel/Passenger friendly: no native modules except sharp):
- Node 20 LTS, Express 5, EJS views with partials (layout + header/footer/newsletter/cta)
- MySQL/MariaDB via Knex (mysql2 driver) with versioned migrations and seeds
- dotenv, helmet (with a real CSP), compression, morgan, express-session +
  express-mysql-session, csrf-csrf (double-submit), express-rate-limit, zod for validation,
  sanitize-html for any stored HTML, marked for markdown, slugify, bcryptjs, multer + sharp,
  nodemailer
- ESLint + Prettier, Vitest + Supertest
- docker-compose.yml with MariaDB 10.11 + Adminer for local dev, .env.example, npm scripts:
  dev (nodemon), start, migrate, seed, test, lint, export

STRUCTURE
- app.js / server.js at root (Passenger looks for app.js), src/{routes,controllers,
  services,repositories,middleware,views,lib}, public/{css,js,assets,fonts},
  public/uploads (gitignored except .gitkeep), db/{migrations,seeds}, scripts/
- Move css/js/assets into public/ with git mv so history is kept. Every old page becomes a
  view; nav and footer become single partials (no more 28 copies).

DATA MODEL (migrations; every content table gets id, slug where public, sort_order,
status draft|published, created_at, updated_at):
- settings (key, JSON value): contact details, social links, homepage section toggles
  (show_speakers, show_team, show_pricing), SEO defaults
- destinations: the 9 countries (Namibia, Botswana, South Africa, Zambia, Zimbabwe,
  Tanzania, Kenya, Rwanda, Uganda): name, iso2, flag path (existing SVGs in
  assets/images/flags), hero_image, tagline, description
- services: the 10 services with title, short_description, body, image, icon_svg,
  featured_on_home
- venue_categories: the 10 from the venues spec (Hotels, Convention Centres, Conference
  Centres, Exhibition Centres, Resorts, Banquet Halls, Corporate Meeting Facilities,
  Stadiums and Arenas, Unique Venues (Museums, Galleries, Heritage Sites), Outdoor Venues
  (Gardens, Parks, Beaches))
- venue_tags: the 41 "Product Categories" from the venues spec, exactly as written
- venues: name, destination_id (country shown where the theme showed price, per spec),
  venue_category_id, description (rich HTML), address, capacity notes, map_embed_url,
  cover_image; venue_tag pivot (multi-select, per spec); venue_images (ordered, up to 20)
- conferences: title, starts_at, ends_at, timezone, format (in-person|hybrid|virtual),
  venue_name, city, destination_id, excerpt, body, cover_image, registration_url,
  featured (homepage shows max 3)
- conference_sessions (agenda: day, start, end, title, description, speaker_id, room)
- conference_ticket_tiers (name e.g. Early Bird/Standard/VIP, price, currency,
  features JSON, cta_label, cta_url). Spec: the homepage pricing section sells tickets for
  ONE chosen conference and shows that conference's name above the tiers.
- speakers: name, role, organisation, bio, photo, socials JSON, consent_confirmed
  (boolean; a speaker is only public when published AND consent_confirmed, the client is
  still collecting consent), is_preview (for the current test-run card)
- conference_speaker pivot
- posts (the blog, which the spec renames "Insights & Resources"): title, excerpt, body
  (markdown), cover_image, author_name, category_id, tags, published_at (future date =
  scheduled), seo_title, seo_description; post_categories
- faqs: question, answer, group, show_on_home
- partners: name, logo, website_url, destination_id (nullable), show_on_home
- gallery_items: image, caption, category (venues|events|destinations)
- team_members: name, role, photo, bio (section hidden by setting until hiring is done)
- pages: slug, title, body markdown, effective_date (privacy-policy, terms-and-conditions)
- submissions: type (contact|proposal), fields JSON, status (new|read|archived), ip, ua
- subscribers: email, token, confirmed_at, unsubscribed_at
- admin_users: name, email, password_hash, role (admin|editor), last_login_at
- audit_log: admin_user_id, action, entity, entity_id, created_at

SEEDS (import what the site has today, nothing invented):
- 10 posts from content/blogs/*.md with their images in assets/images/blog
- 10 services from services.html with assets/images/services
- 4 venues from the venue-*.html pages with their current images
- 9 destinations, 30 FAQs from faq.html (keep the 5 currently on the homepage as
  show_on_home), 28 partners from assets/images/sponsors, 26 gallery items
- privacy-policy and terms-and-conditions from content/legal/*.md VERBATIM. Do not edit a
  word of the legal text.
- conferences: if content/conferences/ contains the client's conference material, seed
  those 3 (images + whatever text is provided). If not, seed none. Never invent events.
- the existing test-run speaker card as one is_preview speaker
- settings from the current footer/contact page (phone, corporate.events@zusammentravels.com,
  the 6 social links)

ROUTES
- Clean URLs: /, /about, /services, /services/:slug, /venues, /venues/:slug, /events,
  /events/:slug, /insights, /insights/:slug, /gallery, /faq, /team, /pricing, /partners,
  /contact, /privacy-policy, /terms-and-conditions
- 301 redirects from EVERY old .html URL (index.html, blog-01.html ... sponsors.html) to its
  new URL, so the GitHub Pages links already sent to the client keep working
- POST /contact, /proposal, /newsletter: zod validation, CSRF, honeypot field, rate limit,
  store to DB, send email via nodemailer (SMTP from .env), redirect with flash message.
  /contact supports ?type=proposal&venue=...&destination=... to prefill the form.
- 404 and 500 views

STATIC PREVIEW EXPORT (the client reviews on GitHub Pages, which can't run Node):
- scripts/export.js: boot the app, crawl every public route (build the route list from the
  DB, not by hand), write HTML to /docs with a BASE_PATH env (/mice-namibia) so all links
  and assets work under the GitHub Pages subpath, copy public/ assets and uploads, add
  .nojekyll. In the export, forms show a small "Preview build: forms are live on the
  production site" note instead of posting. Also emit the old *.html filenames as redirect
  stubs (meta refresh + canonical) so old links resolve.

QUALITY
- Supertest smoke tests: every public route 200, every legacy .html 301s to the right
  place, form validation errors render, CSRF rejects missing tokens.
- Visually compare the old and new homepage, venues and a blog post (Playwright screenshot
  if available) to confirm the port changed nothing visible.
- Update CLAUDE.md: replace the "plain HTML, no build step" rule with the new stack,
  folder map, how to run locally, and that the legal text is now live. Keep every design
  rule (no gradients, no em dashes, no emoji, light theme).
```

Commit message:
```
feat: port site to Express, EJS and MySQL with full content model

Moves every page onto shared EJS layouts, adds Knex migrations and seeds for
conferences, ticket tiers, agenda, speakers, posts, venues with categories and
multi-select tags, destinations, services, FAQs, partners, gallery, team, legal
pages, submissions and subscribers. Legacy .html URLs 301 to clean routes and
a static export to /docs keeps the GitHub Pages review link working. Real
Privacy Policy and Terms text is now published verbatim.
```

---

## Prompt 2 - Design system and homepage overhaul

```
Act as a senior web designer who builds for high-end destination management companies.
The client says the site must reach professional standards: image-rich, lively, visually
engaging, not paragraphs everywhere, not generic. Redesign the design system and the
homepage. The data now comes from MySQL (see CLAUDE.md), so every section below renders
from the DB, never hardcoded.

Hard rules from CLAUDE.md still apply: no gradients (solid colour overlays on photos are
fine), no em dashes in copy, no emoji (SVG icons only), light theme, enterprise tone. Do
not change any of the client's specified copy (headlines/subheadings in
content/specs/01-home-page-spec.pdf).

DESIGN SYSTEM (public/css, split into tokens/base/components/sections files)
- Typography: self-host woff2 (download into public/fonts, no Google Fonts CDN). Display:
  Fraunces (variable, use its soft optical sizes) for H1/H2 with an italic accent on one
  key word per headline. Body/UI: Manrope. Define a fluid type scale with clamp().
- Colour: keep ink navy #14213d as the anchor and the existing blue for primary actions.
  Sample the dominant non-neutral colours from the client logo (use sharp to read
  assets/images/zusammen-logo.png or the revised logo in content/brand/) and derive one
  warm accent from it; if sampling is inconclusive use a Namib dune ochre around #C8662B.
  Add a warm "sand" surface around #F6EFE6 to alternate with white so sections have rhythm
  instead of the current all white/grey. Document every token.
- Shape and depth: 16-24px radii on image cards, one consistent soft shadow scale, thin
  1px hairlines, numbered section eyebrows ("01 / Destinations").
- Motion (all disabled under prefers-reduced-motion): IntersectionObserver reveal
  (fade-up 24px, staggered), count-up stats, image hover zoom inside a fixed frame, header
  that compacts and gains a shadow on scroll, back-to-top button.
- Images: every <img> gets width/height, loading="lazy" below the fold, and responsive
  srcset. Add an image helper/partial that serves sharp-generated WebP + JPG at 3 widths.

LOGO (Macedo: "use the revised logo, the current one is not properly aligned")
- Replace the logo with the revised file from content/brand/. Rebuild the nav lockup so the
  mark and the tagline "Meetings, Incentives, Conferences, Exhibitions" sit on one shared
  centre axis, mark at a fixed height, tagline in small letter-spaced caps. Check it at
  1440, 1024, 768 and 375px. Same lockup in the footer.

HOMEPAGE, in this order (every section must carry imagery):
1. Hero: full-bleed crossfading slideshow (5 of our best real photos from
   public/assets/images and the client photo library at
   "C:\Users\jammyy\Desktop\MICE SEGMENT\Photos", optimised), slow Ken Burns zoom, solid
   dark overlay for contrast, small per-slide location caption (e.g. "Windhoek
   International Convention Centre, Namibia"), slide indicators, the spec headline and
   subheading, CTAs "Request a Proposal" (to the contact form, proposal mode) and
   "Explore Services". Overlapping the hero's bottom edge: a white stats card computed
   from the DB (9 African destinations, partner venue count, 10 services, venue count).
   No invented numbers.
2. "One Partner. Nine Destinations." (spec copy) as an image-led bento mosaic: 9
   destination cards, Namibia larger, each with a real photo, its flag (existing SVGs),
   country name and a one-line hook taken from the matching FAQ answer. Hover/focus reveals
   "Plan an event in <country>" linking to /contact?type=proposal&destination=<country>.
   Namibia and South Africa use our own photos. For the other 7, Macedo explicitly allows
   suitable free images: use authentic location photography from Unsplash or Pexels
   (Victoria Falls, Okavango Delta, Kigali, Nairobi, Zanzibar/Serengeti, Kampala/Lake
   Victoria, Lusaka/Lower Zambezi). Avoid generic stock-looking shots. Record every
   external photo with photographer + licence URL in public/assets/images/CREDITS.md.
3. Services: Macedo's screenshot complains these are icon-only text cards. Make them photo
   cards using public/assets/images/services: 4:3 image, small icon badge overlapping the
   image edge, title, one line, arrow link. Show the 6 featured services plus a
   "View all 10 services" link.
4. Zusammen Travels about section (spec copy): overlapping 3-photo collage beside the text,
   with the "9 African Destinations Served" stat as a bold accent badge on the collage.
5. Featured venues: horizontal scroll-snap carousel of large venue cards (photo, flag +
   country, category chip, "View Details"), with prev/next buttons and swipe.
6. "Upcoming Conferences: In-Person, Live Agenda & Streaming" (spec copy). Macedo wants the
   rows laid out like the reference he sent: per conference a horizontal card with the
   image on the left, time and date, title, short description, location pin line and a
   "Read More" button on the right. Do it on a solid ink-navy band (no purple gradient)
   with a subtle SVG dot pattern. Max 3 featured upcoming conferences from the DB; if
   none, an elegant empty state ("No upcoming conferences right now. Get event alerts")
   linking to the newsletter.
7. Ticket pricing (spec): only renders when a conference is chosen for it in settings.
   Show that conference's name and date above the Early Bird/Standard/VIP tiers.
8. Featured Speakers (spec copy): portrait cards from the DB (published + consent, or
   is_preview), hover reveals role and social links. Keep the small test-run note while
   only the preview speaker exists.
9. Gallery strip "Moments from our venues": two rows of photos drifting in opposite
   directions (CSS marquee, pauses on hover), linking to the gallery.
10. Insights & Resources: latest 3 posts as image cards (cover, category chip, date,
    reading time).
11. FAQ preview: 2 columns, accordion on the right, on the left a photo card with "Still
    have questions?" and the Contact Us button (spec: Contact Us leads to the form).
12. Partners logo marquee (already built, restyle to the new system).
13. NEW "Want to Know More? Let's Connect" band (Macedo asked for it): full-bleed photo
    with solid overlay, headline, one line, primary button "Let's Connect" that goes to
    /contact#contact-form, plus phone and WhatsApp links.
14. Newsletter (spec copy "Stay Connected to Every Session" / "Save Your Spot With Event
    Alerts"). Macedo says it currently looks the same as the footer. Make it clearly
    different: a warm sand panel with dark text and a photo on one side, sitting above the
    navy footer with clear space between them.
15. Footer: restyle only.

Before finishing: screenshot the homepage at 1440 and 375px, check contrast (WCAG AA),
keyboard navigation through the slideshow/carousel/accordion, and Lighthouse
performance/accessibility of at least 90. Run the static export and check it too.
```

Commit message:
```
feat(home): new design system and image-led homepage

Adds self-hosted Fraunces/Manrope type, logo-derived warm accent and sand
surface tokens, reveal and count-up motion with reduced-motion support, and
responsive WebP images. Rebuilds the homepage around a hero slideshow,
destination mosaic with flags, photo service cards, venue carousel, conference
rows, speakers, gallery strip, latest insights, a Let's Connect band and a
newsletter panel distinct from the footer. Uses the client's revised logo with
a centred lockup.
```

---

## Prompt 3 - Inner pages and the rest of Macedo's feedback

```
Apply the design system from the previous step to every inner page, using the same level
of imagery and craft as the homepage. Read content/specs/02, 03, 04, 05, 06 and 07 for the
client's requirements on each page. The Confevo theme the client referenced is at
"C:\Users\jammyy\Desktop\MICE SEGMENT\THEME" (main_files has the saved demo); use it for
layout reference only, never copy its gradients.

SHARED
- Page header: large photo banner (about 420px desktop), solid overlay, breadcrumbs,
  eyebrow, H1, optional subline. Every page gets its own relevant photo.
- Every page ends with the "Let's Connect" band, then the newsletter panel, then footer.
- Blog images must pull through everywhere a post appears (listing, homepage, related
  posts, recent posts, search results), and the same for venue, service and conference
  images. No card anywhere should render without its image.

MACEDO'S SPECIFIC FIXES
1. Remove the word "Sponsors" everywhere. The page becomes "Our Partner Network" at
   /partners (301 from /sponsors and /sponsors.html), nav dropdown label "Our Partners".
   Logo grid in white cards, filterable by country where a partner has one, plus the
   partner marquee.
2. Services page "Regional Reach Across Africa": replace the map-pin chips with the real
   flags, as image tiles (flag, country name, number of venues we list there from the
   DB), and keep the "9 African Destinations Served" stat but give it the accent style.
3. Privacy Policy and Terms and Conditions: render from the pages table with a sticky
   table of contents, effective date, readable 70ch measure, print stylesheet. Text stays
   verbatim.

PAGES
- Services: intro + the 10 services as alternating image/text rows (big photo, "01".."10"
  numerals, title, description, short list of what is included, "Request a Proposal" for
  that service). Sticky in-page service nav on desktop. Each service also gets its own
  /services/:slug page.
- Events (spec 03 says adapt the Confevo events layout exactly): listing with filters
  (country, month, format) and cards with image, date block, venue, ticket button; event
  detail with image header, date/time/location bar, countdown, about, agenda by day
  (conference_sessions), speakers, ticket tiers, venue map embed, "Register" and
  "Request information" CTAs, add-to-calendar (.ics download route).
- Venues (spec 06, follow it closely): heading "Venues", slogan "Discover Spaces That
  Bring Events to Life", the intro paragraph; sidebar filters "Venue Category", "Filter by
  Country" (only the 9 countries) and the multi-select product categories as tag chips;
  results in a 2-column grid of LARGE cards (country shown where the theme showed price,
  "View Details" instead of "Add to Cart"). Filters work server-side via query string
  (so they also work in the static export as pre-rendered combos for category and
  country). Venue detail: heading, 10-image auto-rolling gallery with prev/next, thumbnails,
  swipe and keyboard support, country label, the rich description, then a large
  "Request a Proposal" button that opens the contact form prefilled with the venue. No
  cart, wishlist, category or tags meta block.
  Each of the 4 venues needs 10 gallery images: pick the best from the client's library
  at "C:\Users\jammyy\Desktop\MICE SEGMENT\Photos\<venue>", resize to max 1920px, WebP + JPG,
  add them to the seeds.
- Insights & Resources (spec 05 renames the blog): featured latest post as a wide hero
  card, then grid, category filter, pagination. Post page: cover image header, author,
  date, reading time, table of contents from H2s, share links (LinkedIn, X, WhatsApp,
  email), related posts with images, sidebar with recent posts (with thumbnails) and
  categories.
- About: storytelling with images: collage, "Why Zusammen MICE" pillars each with a photo,
  destinations strip with flags, a 5-step process timeline (Enquiry, Proposal, Planning,
  Delivery, Post-Event Evaluation) with icons.
- Gallery: masonry grid, category filter (venues, events, destinations), accessible
  lightbox with keyboard, swipe and captions.
- FAQ: group the 30 questions (General, Destinations, Planning and Logistics), live search
  filter, sticky contact card with photo.
- Team: Meet Our CEO and Our Team stay hidden behind their settings toggles (client is
  still hiring). Speakers grid from the DB.
- Pricing: ticket tiers for the conference chosen in settings, conference name above the
  tiers (spec 01).
- Contact (spec 07): split layout, the form has two modes, General Enquiry and Request a
  Proposal (company, destination select of the 9, event type, dates, delegates, budget
  range, venue, message), anchored at #contact-form for the Let's Connect buttons; contact
  cards (phone, WhatsApp, email, Windhoek office); embedded map; success state.
- 404: full photo background, short message, links home and to venues.

QUALITY
- Screenshot every page at 1440 and 375px and fix anything that looks unfinished, empty or
  text-heavy. No section should be paragraphs without a visual.
- Update Supertest route tests for the new /partners, service and event detail routes and
  the .ics route. Re-run the static export and spot check it under /mice-namibia/.
- Update CLAUDE.md with what changed and which of Macedo's points are done.
```

Commit message:
```
feat: image-rich inner pages and client round 3 fixes

Rebuilds Services, Events, Venues, Insights, About, Gallery, FAQ, Team,
Pricing and Contact on the new design system. Venues follow the client spec
with category, country and multi-select tag filters, two-column cards and a
10-image auto-rolling gallery per venue. Renames Sponsors to Our Partner
Network, adds flags to Regional Reach, publishes the legal pages with a table
of contents, and makes post, venue and service images appear wherever those
items are listed.
```

---

## Prompt 4 - Admin CMS for the client

```
Build the admin backend at /admin so Macedo (non-technical, will post weekly per spec 05)
can manage every content section himself. Use the same design tokens as the public site
for a clean, calm admin UI; server-rendered EJS, no SPA framework.

AUTH AND SECURITY
- Login with email + password (bcryptjs cost 12), rate limited, lockout after 5 failed
  attempts for 15 minutes, session regeneration on login, secure/httpOnly/sameSite cookies,
  CSRF on every form, role-based access (admin, editor: editors cannot manage users or
  settings), password change, "forgot password" via emailed one-time token.
- npm run create-admin CLI to create the first account.
- Every create/update/delete writes to audit_log.

DASHBOARD
- Counts (published posts, upcoming conferences, venues, new submissions), recent
  submissions, scheduled posts, quick actions (New post, New conference, New venue).

MODULES (list with search, filters, pagination, status badges; edit form; preview link;
draft/published; drag-to-reorder where sort_order exists, using self-hosted SortableJS):
- Insights posts: Quill editor (self-hosted, output sanitised server-side), cover image,
  category, tags, excerpt, SEO fields, schedule via published_at.
- Conferences: details, cover image, featured toggle (warn if more than 3), agenda
  repeater (sessions by day), ticket tier repeater, speaker multi-select.
- Speakers: photo, bio, socials, consent_confirmed checkbox. Publishing without consent is
  blocked with a clear message.
- Venues: country select (the 9), Venue Category select (10), Product Categories
  multi-select (41) with type-to-search, rich description, address, map embed, image
  gallery uploader with drag-and-drop ordering (aim for 10 images, show a hint).
- Services, Destinations, FAQs (with group + "show on homepage"), Partners (logo upload,
  country, show on homepage), Gallery (bulk upload, captions, category), Team members,
  Pages (legal text in a markdown editor with preview).
- Settings: contact details, social links, homepage toggles (speakers, team, pricing),
  which conference the pricing section sells tickets for, SEO defaults.
- Submissions inbox: filter by type/status, detail view, mark read/archived, reply via
  mailto, CSV export. Subscribers: list, CSV export, unsubscribe.
- Users (admin only).

UPLOADS
- multer with size limits, file type checked by magic bytes, random filenames; sharp
  generates WebP + JPG at 3 widths plus a thumbnail into public/uploads/<module>/.
  Deleting an item removes its files. If sharp is unavailable on the host, store the
  optimised original and log a warning instead of crashing.

QUALITY
- Vitest/Supertest for login, lockout, CSRF, role restrictions, and create/edit/delete for
  posts, conferences and venues.
- Write ADMIN-GUIDE.md for Macedo in plain language with screenshots: how to log in, add a
  conference with tickets and agenda, publish or schedule a weekly post, add a venue with
  its 10 photos, publish a speaker once consent is in, read form submissions.
```

Commit message:
```
feat(admin): content management backend for the client

Adds a session-authenticated admin with roles, lockout, CSRF and audit log,
plus modules for posts, conferences (agenda, ticket tiers, speakers), speakers
with consent gating, venues with category, country and multi-select tags,
services, destinations, FAQs, partners, gallery, team, legal pages, settings,
submissions and subscribers. Uploads are validated and resized to WebP and
JPG. Includes an admin guide for the client.
```

---

## Prompt 5 - Staging deploy, SEO and handover docs

```
Prepare the app for a staging deploy on our Namhost cPanel hosting (same approach as the
main Zusammen site) and for the eventual public launch next year.

DEPLOY
- Passenger-compatible entry (app.js), cPanel "Setup Node.js App" instructions,
  production .env (DB, SESSION_SECRET, SMTP using the corporate.events@zusammentravels.com
  mailbox, BASE_URL), npm ci --omit=dev, migrations on deploy, persistent public/uploads,
  sharp install notes for the host, log rotation.
- Staging must NOT be indexed: X-Robots-Tag noindex + robots.txt disallow when
  SITE_ENV=staging, and optional HTTP basic auth via env. The client only launches publicly
  next year.
- Write DEPLOY.md with the exact cPanel steps and a rollback procedure.

SEO (for launch)
- Per-page titles/meta descriptions from the DB with defaults, canonical URLs, Open Graph
  and Twitter cards using each page's image, sitemap.xml generated from the DB,
  JSON-LD: Organization, Event for conferences, Article for posts, Place for venues.

PERFORMANCE AND SECURITY
- Cache headers for static assets (fingerprinted filenames), gzip/brotli, HTTP security
  headers verified (CSP without unsafe-inline where possible), Lighthouse 90+ on mobile for
  home, venues, a venue, a post and contact.
- npm audit clean of high/critical.

DOCS
- README.md: overview, stack, local setup with Docker, scripts, folder map, export to
  GitHub Pages, deploy. Update CLAUDE.md to the final state.
```

Commit message:
```
chore: staging deploy setup, SEO metadata and project docs

Adds Passenger-ready production config, noindex and optional basic auth for
staging, sitemap, canonical and Open Graph tags, JSON-LD for organisation,
events, articles and venues, caching and security headers, and README and
DEPLOY guides.
```
