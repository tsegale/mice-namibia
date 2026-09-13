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
- Venue photography (Movenpick, The Westin Cape Town, WICC, Windhoek Country
  Club Resort & Casino) and the Confevo theme reference files live in the
  original `MICE SEGMENT` folder on the Desktop, not copied in here yet —
  pull them in when the Venues page is built.

## Known content gaps (flagged in the brief, not yet delivered by the client)

- Speaker bios/photos for the homepage "Featured Speakers" section — client
  said these come via a Drive link, not yet received.
- Partner/brand logos for the "Trusted by" strip — same, pending Drive link.
- FAQ question/answer content — client said it will arrive as a Word doc.
- Real upcoming-conference listings for the homepage schedule section.
- Page 5 of the Home Page spec ("About the Virtual Innovation Summit")
  tells you to replace the section with "Zusammen Travels" branding — that's
  a different Spybitech client (a travel agency) and doesn't belong on this
  site. Treat that instruction as a copy-paste leftover from another brief:
  write fresh MICE-relevant copy for that section instead, and flag it back
  to the client rather than shipping "Zusammen Travels" text here.

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
assets/images/
content/specs/        Page-by-page design briefs (reference only, not shipped)
content/blogs/         Finished blog articles (reference only, not shipped)
```
