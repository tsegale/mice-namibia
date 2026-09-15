# MICE Namibia — Project Rules

Working name: "MICE Namibia" (Meetings, Incentives, Conferences & Exhibitions).
No final brand name confirmed. The site is explicitly described in the brief
as "Zusammen Tours and Travel Agency's MICE segment" (see below) — it may
ship under Zusammen Travels branding rather than as a standalone brand.
Confirm with Jammy/the client before finalizing site title/branding.

## Source material

- `content/specs/` — the client's page-by-page design brief, one PDF per
  section (01 Home, 02 Pages, 03 Events, 04 Services, 05 Blogs, 06 Venues,
  07 Contact Us). These are screenshots of the "Confevo" ThemeForest theme
  (https://themeforest.net/item/confevo-event-conference-wordpress-theme/63182937)
  annotated in red/black with exactly what copy and layout to keep, cut, or
  change. Read the relevant spec before building or editing a page.
- `content/blogs/` — 10 finished blog articles, each as both `.docx` and a
  cleaned `.md` (converted from the docx - use the `.md` when writing blog
  pages, it's plain text ready to drop into HTML).
- `assets/images/venues/` — real, web-optimized photography (resized to a
  1920px max width, compressed) for all 4 venues: `movenpick/`,
  `the-westin-cape-town/`, `wicc/`, `windhoek-country-club-resort-casino/`,
  each with 5-7 shots. Curated subset only - the full photo libraries (many
  thousands of images, mostly unoptimized 10-30MB camera originals) live only
  in the original `MICE SEGMENT/Photos` folder on the Desktop. Go back there
  only if a specific page needs a shot not already pulled in.
- The Confevo theme reference files live in the original `MICE SEGMENT`
  folder on the Desktop (not copied in here - it's a reference, not shippable
  code).

## Zusammen Travels connection (important, confirmed across multiple specs)

This site is Zusammen Tours and Travel Agency's MICE segment, not an
unrelated company. Multiple places in the brief reference "Zusammen Travels"
by name (Home page About section, Pages spec's Sponsors section, Contact Us
spec's email domain is zusammentravels.com). Wherever the brief says to use
Zusammen Travels branding/copy, use it - it's correct, not a mistake.

## Client review round 1 (Macedo, September 2026)

The client reviewed the live GitHub Pages build and replied with feedback.
Status of each point:

Implemented directly:
- National flags added next to each of the 9 destination names on the
  homepage (`assets/images/flags/*.svg`) - hand-authored SVGs, not fetched
  from an external CDN (flagcdn.com is blocked by this environment's egress
  allowlist, and a self-contained site with no runtime external dependency
  is preferable anyway).
- Homepage "9 African Destinations Served" stat restyled as a solid
  `--color-primary` accent block with white text for more visual weight,
  replacing the earlier plain "40+ Destinations Worldwide" placeholder
  (superseded - "9" is the correct, confirmed figure per the venues built).
- Footer social icons on every page now link to Zusammen Travels' real
  accounts (Facebook, Instagram, YouTube, X, LinkedIn, TripAdvisor) matching
  https://zusammentravels.com/, per the client's instruction to reuse the
  same platforms/links as the main site.
- `.page-header` (the banner on inner pages like Events and Blog) enlarged
  for more visual prominence - taller min-height, bigger heading size.
- Featured Speakers section given a single test-run placeholder card (name
  "Speaker Name", generic - not a real or fabricated named individual)
  purely to preview the card design per the client's request, since consent
  from real speakers is still pending. Full lineup still to come.
- Fixed a pre-existing CSS bug while touching the speaker cards: the
  `.image-placeholder` class's `height: 100%` was fighting
  `.speaker-card-media`'s `aspect-ratio: 1` inside a CSS Grid stretch
  context, which silently clipped the name/title text out of view on every
  speaker card (homepage preview and the Team page's 8-slot Speakers
  section alike). Fixed with a `.speaker-card-media.image-placeholder`
  override.
- Upcoming Events / homepage schedule section confirmed correct as-is - the
  client wants it left empty with a "no upcoming events" message until real
  events are confirmed.
- Confirmed with the client and left as planned: full public launch waits
  until the client transitions to full-time CEO; Meet Our Team section
  waits until hiring is complete; Meet Our CEO section waits on the client's
  own name/photo.

Blocked - pending the client's Google Drive folder:
- The client granted Drive access for a handover document plus additional
  images (blog images, Services page images, Gallery images), but this
  environment has no Google Drive connector, so none of that folder's
  contents are reachable from here. Needs Jammy to either sync/download the
  relevant files into the local project folder, or attach them directly, so
  they can be implemented:
  - Handover document - instructions not yet reviewed or applied.
  - Services page images - not yet added.
  - Additional blog/gallery images - not yet added.

## Known content gaps (flagged in the brief, not yet delivered by the client)

Use clearly marked placeholders (e.g. `<!-- TODO: ... -->`) for all of these
rather than inventing specifics:

- Speaker bios/photos for the homepage "Featured Speakers" section and the
  Team page's "Speakers" section (up to 8 slots) - pending client Drive link
  (see "Client review round 1" above - inaccessible from this environment)
  and individual consent from each speaker.
- Partner/sponsor logos and details for the "Trusted by" strip and the
  Sponsors page - pending Drive link.
- FAQ question/answer content - client is providing this as a Word doc, not
  yet received. (Reused identically on both the homepage and the FAQ page.)
- Real upcoming-conference listings for the homepage schedule section and
  the Events page - client confirmed this should stay empty for now (see
  "Client review round 1" above).
- Gallery page images - client specified a particular Drive-linked image set
  to use; not yet received (see "Client review round 1" above). Use a small
  selection from `assets/images/venues/` as a placeholder in the same
  layout, clearly marked for swap-out.
- Services page images - client provided these via Drive; not yet received
  (see "Client review round 1" above).
- Meet Our CEO section (Team page) - name and photo not provided; on hold
  until the client is full-time CEO (client-confirmed).
- Our Team section (Team page, 4 images) - photos not provided; on hold
  until hiring is complete (client-confirmed).
- Privacy Policy and Terms and Conditions full text - client provided real
  legal text via a Drive link we don't have access to. DO NOT write
  plausible-sounding legal text to fill these in - that risks shipping
  incorrect legal terms. Build the page shell/structure only (matching the
  section headings shown in the spec, e.g. "Personal Information", "Your
  Registration Obligations") with a clearly visible
  `<!-- TODO: replace with client-provided legal text -->` and a visible
  on-page placeholder note, not invented clauses.
- Stats/numbers on the Sponsors page's "Event Participation Overview" map
  section - the reference theme's example numbers (e.g. "5.2k+") are not
  confirmed real figures. Keep them clearly as illustrative placeholders or
  omit rather than presenting unverified numbers as fact.

## Design rules (apply to every page, no exceptions)

- No gradients anywhere (the Confevo reference theme is gradient-heavy —
  translate its sections into a clean, flat, light design instead of
  copying its purple gradient treatment).
- No em dashes in copy.
- No emoji — SVG icons only.
- No generic AI-generated stock-photo aesthetic.
- Light theme by default; professional, enterprise-grade tone throughout.
- Plain HTML/CSS/JS, multi-page static site. No build step, no framework.
- Every page shares the same nav and footer already established in
  index.html - don't recreate them differently per page.

## Git

- Conventional Commits for every commit (`feat:`, `fix:`, `chore:`, `docs:`,
  etc.).
- No AI co-author attribution in commit messages.

## Structure

```
index.html                 Homepage (built)
venues.html                 Venues listing (built)
venue-movenpick.html         (built)
venue-westin-cape-town.html  (built)
venue-wicc.html               (built)
venue-windhoek-country-club.html (built)
contact.html                Contact Us (built)
services.html               From "04-services-spec.pdf"
events.html                 From "03-events-spec.pdf"
blog.html                   Blog listing, from "05-blogs-spec.pdf"
blog-01.html ... blog-10.html   Individual posts, from content/blogs/*.md
about.html                  From "02-pages-spec.pdf" (About Us sub-page)
pricing.html                 (Pages sub-page)
sponsors.html                 (Pages sub-page)
gallery.html                  (Pages sub-page)
faq.html                      (Pages sub-page)
team.html                     (Pages sub-page, nav label "Meet our Team")
privacy-policy.html           (Pages sub-page - shell only, see gaps above)
terms-and-conditions.html     (Pages sub-page - shell only, see gaps above)
css/style.css
js/main.js
assets/images/venues/<venue-slug>/   Curated, optimized venue photography
content/specs/        Page-by-page design briefs (reference only, not shipped)
content/blogs/         Finished blog articles, .docx + .md (reference only)
```
