# MICE Namibia — Project Rules

Working name: "MICE Namibia" (Meetings, Incentives, Conferences & Exhibitions). No
final brand name has been provided by the client yet — nothing in the source
brief names the company. Treat "MICE Namibia" as a placeholder until Jammy
confirms a real name, and keep it easy to find/replace across the codebase.

## Source material

- `content/specs/` — the client's page-by-page design brief, one PDF per
  section (Home, Pages, Events, Services, Blogs, Venues, Contact Us). These
  are screenshots of the "Confevo" ThemeForest theme
  (https://themeforest.net/item/confevo-event-conference-wordpress-theme/63182937)
  annotated in red/black with exactly what copy and layout to keep, cut, or
  change. Read the relevant spec before building or editing a page.
- `content/blogs/` — 10 finished blog articles (.docx) ready to drop into the
  Blog section once it's built.
- `assets/images/venues/` — real, web-optimized photography (resized to a
  1920px max width, compressed) for all 4 venues from the brief:
  `movenpick/`, `the-westin-cape-town/`, `wicc/`, and
  `windhoek-country-club-resort-casino/`, each with 5-7 shots (exterior,
  conference space, dining, and a couple of signature spaces). This is a
  curated subset, not the full photo libraries, which run into the
  thousands of images per venue and live only in the original
  `MICE SEGMENT/Photos` folder on the Desktop, most as unoptimized 10-30MB
  camera originals. Go back to that folder only if a specific page needs a
  shot not already pulled in here.
- The Confevo theme reference files themselves live in the original
  `MICE SEGMENT` folder on the Desktop (not copied in here - it's a
  ThemeForest reference, not something to ship).

## Known content gaps (flagged in the brief, not yet delivered by the client)

- Speaker bios/photos for the homepage "Featured Speakers" section — client
  said these come via a Drive link, not yet received.
- Partner/brand logos for the "Trusted by" strip — same, pending Drive link.
- FAQ question/answer content — client said it will arrive as a Word doc.
- Real upcoming-conference listings for the homepage schedule section.
- CORRECTION (superseded an earlier note in this file that called this a
  mistake - it isn't): page 5 of the Home Page spec tells you to replace
  the "About" section with "Zusammen Travels" branding, and
  content/specs/06-venues-spec.pdf confirms why: this site is explicitly
  "Zusammen Tours and Travel Agency's MICE segment" - i.e. a MICE-focused
  sub-site/service line of Jammy's existing Zusammen Travels client
  (zusammentravels.com), not an unrelated company. So the About section
  SHOULD reference Zusammen Travels, using the client's exact text:
  Main: "Zusammen Travels: Connecting the World Through a Global Digital
  Experience"
  Description: "Zusammen Travels brings the world closer through a global
  digital experience that inspires exploration, connection, and discovery.
  Through innovation and meaningful travel experiences, we connect people
  with destinations, cultures, and opportunities worldwide, creating a
  connected space where stories, experiences, and global possibilities
  come together."
  Stat: the brief's exact text here ("25+ Online & Accessible Worldwide to
  40+") is garbled - most likely it means change the reference theme's
  "25+" stat to "40+" while keeping a similar label. Confirm the intended
  number/label with the client before finalizing; don't invent specifics.
  This also means the working name "MICE Namibia" may not be the final
  brand - it could end up presented as a Zusammen Travels MICE service
  rather than a standalone brand. Flag this to Jammy/the client rather
  than assuming.

Use clearly marked placeholders (e.g. an HTML comment `<!-- TODO: real
speaker bios pending client Drive link -->`) for anything blocked on missing
client content, so it's easy to grep for later.

## Design rules (apply to every page, no exceptions)

- No gradients anywhere (the Confevo reference theme is gradient-heavy —
  translate its sections into a clean, flat, light design instead of
  copying its purple gradient treatment).
- No em dashes in copy.
- No emoji — SVG icons only.
- No generic AI-generated stock-photo aesthetic.
- Light theme by default; professional, enterprise-grade tone throughout.
- Plain HTML/CSS/JS, multi-page static site. No build step, no framework.

## Git

- Conventional Commits for every commit (`feat:`, `fix:`, `chore:`, `docs:`,
  etc.).
- No AI co-author attribution in commit messages.

## Structure

```
index.html          Homepage
about.html           (from "2. Pages" spec — build later)
events.html          (from "3. Events" spec — build later)
services.html        (from "4. Services" spec — build later)
blog.html            (from "5. Blogs" spec — build later)
venues.html          (from "6. Venues" spec — build later)
contact.html         (from "7. Contact Us" spec — build later)
css/style.css
js/main.js
assets/images/venues/<venue-slug>/   Curated, optimized venue photography
content/specs/        Page-by-page design briefs (reference only, not shipped)
content/blogs/         Finished blog articles (reference only, not shipped)
```
