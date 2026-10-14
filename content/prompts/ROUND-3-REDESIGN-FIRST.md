# MICE Namibia, Round 3: redesign first, then backend

Source: Macedo's email of 7 Oct 2026 ("Re: Handover of MICE Website"), the three conference
write-ups and images he put in Drive (`MICE SEGMENT/EVENTS`), and the original handover specs
in `content/specs/`.

This file replaces `ROUND-3-PROMPTS.md` (that one put the backend first; we agreed to do
the visual overhaul first so Macedo can review the new look quickly, then port it onto
Node + Express).

How to run: one prompt per Claude Code session, from the `mice-namibia` folder. Switch
Claude Code to plan mode (Shift+Tab), paste the prompt, read its plan, then let it run.
Commit after each one with the message underneath it, then push so the GitHub Pages link
updates.

```
PHASE 1  Redesign (static site, review link stays tsegale.github.io/mice-namibia)
  1  Brand design system, shared chrome and quick fixes   (all pages)
  2  Conferences: data, Events page and 3 event pages
  3  Homepage
  4  Inner pages
  5  Designer QA pass                                     -> send Macedo the link

PHASE 2  Backend (Node + Express)
  6  Port to Express + EJS + MySQL, seeded from Phase 1
  7  Admin CMS
  8  Staging deploy, SEO, handover docs                  -> Macedo gets an admin login
```

## Before you start (about 5 minutes)

1. **Download the conference images.** In Drive open `Spybitech Namibia > MICE SEGMENT >
   EVENTS`. Download the three numbered folders and put them here (4 images each):
   - folder `1.` -> `content/conferences/edulearn-2027/`
   - folder `2.` -> `content/conferences/icsdeg-2027/`
   - folder `3.` -> `content/conferences/iccrsgt-2027/`

   You don't need the three Google Docs: their full text is already in Prompt 2.
2. **Revised logo:** you're asking Macedo for it. When it arrives, drop it in
   `content/brand/`. Prompt 1 fixes the alignment of the current lockup and makes the
   swap a one-line change, so nothing is blocked.
3. **Node 20** must be installed (Phase 1 uses a small dev-only image script with sharp;
   the site itself stays plain HTML/CSS/JS with no build step).

Things to raise with Macedo when you send the review link (Claude Code will not guess these):
- The EDULEARN write-up says "ICENLT" twice (looks copied from another event). Prompt 2
  uses EDULEARN throughout. Ask him to confirm.
- The Pricing page still shows the theme's demo tiers ($29/mo etc). Prompt 4 changes them
  to "Price on request" until he gives real ticket prices per conference.
- Is +264 81 245 5852 also on WhatsApp? If yes we can add a WhatsApp button.
- Revised logo file.

---

# PHASE 1: REDESIGN

## Prompt 1: Brand design system, shared chrome and quick fixes

```
You are the senior web designer on this project. The client (Macedo, future CEO of Zusammen
Tours and Travel Agency's MICE segment) says the site must reach professional standards:
lively, image-rich, visually engaging, not paragraphs everywhere, not generic. This first step
builds the design system and every element shared across pages. Pages themselves get
redesigned in the next prompts, but every page must still look correct after this step.

Read CLAUDE.md first. Its design rules still apply: no gradients (solid colour overlays on
photos are fine), no em dashes in any visible copy, no emoji (SVG icons only), light theme by
default (solid dark navy bands as sections are fine), enterprise tone. Plain HTML/CSS/JS,
no framework, no site build step. A backend port (Node + Express + EJS) happens after the
redesign, so keep markup component-based and consistent so it can later be split into EJS
partials 1:1.

ART DIRECTION: "Together, across Africa"
The logo is three figures gathering with raised arms; "Zusammen" means "together". The
current site uses a generic Tailwind-style blue (#1d4ed8) that has nothing to do with the
brand. Rebuild the palette from the logo instead:
- Brand colours sampled from assets/images/zusammen-logo.png:
  navy #1D3161, orange #EF8621, green #92C742.
- Tokens (css custom properties, documented in a comment block):
  --navy-900 #0F1C3F (dark bands, footer), --navy-700 #1D3161 (headings, ink),
  --orange-500 #EF8621 (primary CTA fill, always with navy text: contrast 4.87:1),
  --orange-700 #B5560C (orange text/links on light backgrounds: 4.88:1),
  --green-500 #92C742 (accents, chips, data highlights on navy: 6.29:1),
  --green-700 #3F7A1C (green text on light: 5.23:1),
  --sand-50 #F7F1E8 (warm alternate surface), --mist-50 #EEF2F8 (cool alternate surface),
  body text #3D4658, muted #6B7280, hairline #E4E1DA.
  Retire #1d4ed8 and all its tints everywhere. Verify WCAG AA for every text/background
  pair you use and note the ratios in the token comment.
- Signature motif 1, the "gathering stripe": a short three-segment bar (navy, orange,
  green, solid blocks, e.g. 28px/12px/12px by 4px) used as the eyebrow above section titles
  and as a divider. It echoes the three figures in the logo. Solid colours, never blended.
- Signature motif 2, "dune lines": an inline SVG pattern of thin flowing contour lines
  (Namib dunes), stroke 1px at low opacity, used on navy bands and behind stats. Build it as a
  reusable CSS background (SVG data URI) so it costs no extra request.
- Section eyebrows are numbered: "01 / Destinations", small caps, letter-spaced, with the
  gathering stripe.
- Section rhythm: alternate white, sand and navy bands so pages never feel like one long
  white sheet.

TYPOGRAPHY (self-hosted woff2 in assets/fonts, no Google Fonts CDN link; download the
files from the google/fonts GitHub repo or fontsource, include the OFL licence files)
- Display: Fraunces (variable, use a soft optical size), for H1/H2 and big numbers. One
  key word per major headline can be set in Fraunces italic in orange-700 for emphasis.
- UI/body: Plus Jakarta Sans (variable).
- Fluid type scale with clamp(), 1.6 body line height, 68ch max measure for long text.
- font-display: swap, preload the two main woff2 files.

COMPONENTS (one stylesheet is fine, but organise css/style.css into clearly commented
sections: tokens, base, layout, components, sections, utilities)
- Buttons: primary (orange fill, navy text), secondary (navy fill, white text), ghost
  (outline), text-link with an arrow that slides 4px on hover. Visible focus rings.
- Cards: image-first cards with 18px radius, image inside a fixed aspect-ratio frame that
  zooms 1.04 on hover/focus, one shared soft shadow scale (2 levels).
- Chips/pills: country chip with flag (assets/images/flags), category chip.
- Page header (used by every inner page): photo banner about 440px tall desktop /
  300px mobile, solid navy overlay at about 55% opacity, breadcrumbs (Home / Page),
  numbered eyebrow, H1 in Fraunces, optional one-line subtitle. This also covers
  Macedo's earlier request that inner-page heading images be more prominent.
- Motion (all disabled under prefers-reduced-motion): IntersectionObserver reveal
  (fade-up 24px, staggered children), count-up numbers, header that compacts and gains a
  shadow after scrolling 40px, back-to-top button. Put this in js/main.js as small
  independent modules with data-attributes as hooks.

IMAGES
- Create tools/package.json (devDependencies: sharp only) and tools/optimise-images.mjs:
  takes a source image, outputs WebP and JPG at 640, 1280 and 1920px wide (never upscale),
  quality ~78, into the same assets folder with -640/-1280/-1920 suffixes. Add
  tools/node_modules to .gitignore. Document usage in CLAUDE.md.
- From now on every content <img> uses <picture> with WebP srcset + JPG fallback, explicit
  width/height, meaningful alt text, loading="lazy" below the fold, fetchpriority="high" on
  the first visible hero image.
- Run the script over everything already in assets/images (venues, services, blog,
  gallery) and switch existing <img> tags to the new markup.

SHARED CHROME (apply identically to all 28 HTML pages)
1. Logo lockup. Macedo says the current logo "is not properly aligned" and a revised file
   is coming. Fix the lockup now: mark at a fixed 44px height, and directly below it the
   tagline "Meetings, Incentives, Conferences, Exhibitions" in small letter-spaced caps,
   both centred on one shared vertical axis, total lockup no wider than the tagline, never
   wrapping awkwardly. Check it at 1440, 1024, 768 and 375px. Use the same lockup in the
   footer (on navy, use a white-text variant of the tagline). Put the logo path in one
   place per page (the .brand-lockup img) and add a note in CLAUDE.md: "revised logo goes
   in content/brand/, then replace assets/images/zusammen-logo.png".
2. Nav: Pages dropdown becomes: About Us, Our Partners, Gallery, FAQ, Pricing,
   Privacy Policy, Terms and Conditions. Remove "Sponsors" (client: "the wording is a
   problem") and remove "Meet our Team" (client: the team section only goes up once he has
   finished hiring). Keep the dropdown accessible (existing aria pattern) and the mobile
   menu working. Mobile menu becomes a full-height navy panel with large links.
3. Rename sponsors.html to partners.html (git mv). Leave a sponsors.html stub that
   redirects (meta refresh + canonical + JS location.replace) so links already sent to the
   client still work. Replace the word "Sponsors"/"sponsor" in every visible label,
   heading, alt text and class name across the site (assets/images/sponsors can stay as a
   folder name). team.html stays in the repo but gets <meta name="robots" content="noindex">
   and is linked from nowhere until the client says hiring is done.
4. "Let's Connect" band (Macedo asked for this explicitly): new section shown on every
   page just before the newsletter/footer. Full-bleed photo (use a strong WICC event shot)
   with solid navy overlay and the dune-lines pattern; eyebrow, headline
   "Want to Know More? Let's Connect", one supporting line, primary button "Let's Connect"
   linking to contact.html#contact-form, secondary text link with the phone number.
   Make sure contact.html has id="contact-form" on the form section.
5. Newsletter vs footer. Macedo: the "Stay in the loop" block and the footer look the same,
   so people can't tell them apart. Pull the newsletter out of the footer into its own
   component: a sand-coloured (#F7F1E8) rounded panel with navy text, a photo on the left
   third, the form on the right, sitting in its own white section ABOVE the footer with
   clear space between them. The footer stays navy. Only one newsletter per page (the
   homepage keeps its spec copy "Stay Connected to Every Session" / button "Save Your Spot
   With Event Alerts"; every other page uses "Stay in the loop" / "Subscribe"). Show a
   friendly inline success message on submit (no backend yet; keep the TODO).
6. Footer restyle on navy with the dune-lines pattern: brand lockup + one line about the
   company + phone + corporate.events@zusammentravels.com + the 6 social icons (existing
   links, keep them); link columns "Explore" (About Us, Services, Venues, Events, Blog),
   "Resources" (Gallery, FAQ, Our Partners, Pricing), "Legal" (Privacy Policy, Terms and
   Conditions); a row of the 9 destination flags; bottom bar
   "Copyright 2026 Zusammen Tours and Travel Agency (MICE Department). All rights reserved."
   (that is the legal entity name used in the client's Privacy Policy and Terms).
7. Legal pages (Macedo says these are still missing; they are). Replace the placeholder
   content in privacy-policy.html and terms-and-conditions.html with the text in
   content/legal/privacy-policy.md and content/legal/terms-and-conditions.md VERBATIM: do not
   change a single word, number or heading. Layout: page header, "Effective Date: 01
   January 2027" shown as a badge, a sticky table of contents on the left (desktop) built
   from the numbered H2s with scroll-spy, the text on the right at a 68ch measure, a
   "Questions about this policy? Contact us" card at the end, and a print stylesheet.
   Remove the "Full policy text pending" notices.

QUALITY
- Screenshot index.html, partners.html, privacy-policy.html and contact.html at 1440 and
  375px (Playwright via npx if available) and fix anything broken by the new chrome.
- Grep the whole site for "#1d4ed8", "Sponsor", " - " used as a dash in copy, and em
  dashes; fix every hit.
- Update CLAUDE.md: new palette and tokens, fonts, motifs, image pipeline, nav/footer
  structure, logo swap note, Sponsors renamed to Partners, Team hidden, legal pages done.
```

Commit message:
```
feat: brand design system, new site chrome and real legal pages

Replaces the generic blue with a palette sampled from the Zusammen logo,
adds self-hosted Fraunces and Plus Jakarta Sans, numbered eyebrows, dune
line pattern, reveal motion and a WebP image pipeline. Fixes the logo
lockup alignment, renames Sponsors to Our Partners with a redirect, hides
the Team page until hiring is done, adds a Let's Connect band and a
newsletter panel that no longer blends into the footer, and publishes the
client's Privacy Policy and Terms verbatim.
```

---

## Prompt 2: Conferences, Events page and 3 event pages

```
The client has sent the first three conferences. Build them properly: structured data,
the Events archive page and a detail page per conference. Use the design system from
CLAUDE.md (navy/orange/green brand tokens, Fraunces + Plus Jakarta Sans, gathering
stripe, dune lines, <picture> + optimise-images script). Same hard rules: no gradients, no
em dashes in copy, no emoji.

SOURCE IMAGES: content/conferences/<slug>/ has 4 images per conference. For each one, pick
the strongest landscape image as the cover and use the other 3 as the gallery. Run them
through tools/optimise-images.mjs into assets/images/conferences/<slug>/ with clean
kebab-case filenames.

DATA: create content/data/conferences.json as the single source of truth (Phase 2 seeds the
database from it), fields: slug, title, short_title, starts_at, ends_at (ISO with
+02:00 for Namibia, +03:00 for Kenya), city, country, country_iso2, organiser, excerpt
(about 160 chars, written from the body, no new claims), body (array of paragraphs),
pull_quote, cover, gallery[], status "upcoming". Use the client's text below verbatim
except: (a) the EDULEARN write-up says "ICENLT" twice, which looks like a copy-paste slip;
use "EDULEARN" and add a note to CLAUDE.md that this needs the client's confirmation;
(b) times: the client wrote "08:30 AM - 15:30 PM", show them as 24h "08:30 to 15:30".

1. slug edulearn-2027
   Title: International Conference on Education and New Learning Technologies (EDULEARN)
   Date: Friday 8 January 2027, 08:30 to 15:30. City: Swakopmund, Namibia.
   Organiser: World Research Society.
   Body: "International Conference on Education and New Learning Technologies (EDULEARN),
   on 8th Jan 2027 at Swakopmund, Namibia. The key intention of EDULEARN is to provide
   opportunity for the global participants to share their ideas and experience in person
   with their peers expected to join from different parts on the world. In addition this
   gathering will help the delegates to establish research or business relations as well
   as to find international linkage for future collaborations in their career path. We hope
   that EDULEARN outcome will lead to significant contributions to the knowledge base in
   these up-to-date scientific fields in scope. This event will be organized by World
   Research Society at the city of Swakopmund, Namibia."
   Pull quote: "With delegates expected from different parts of the world, EDULEARN 2027 is
   an exciting opportunity to share ideas, exchange experiences, establish research and
   business connections, and create international partnerships for future collaboration."

2. slug icsdeg-2027
   Title: International Conference on Sustainable Development and Economic Growth (ICSDEG)
   Date: Friday 8 January 2027, 08:30 to 15:15. City: Swakopmund, Namibia.
   Organiser: World Research Society.
   Body: "International Conference on Sustainable Development and Economic Growth (ICSDEG),
   on 8th Jan 2027 at Swakopmund, Namibia. The conference provides a platform for
   professionals involved in Sustainable Development and Economic Growth to exchange
   knowledge and gain an insight into the state of the art in the current technology,
   techniques and solutions in Sustainable Development and Economic Growth as they have
   been developed and applied in different countries. Participants include a wide variety
   of stakeholders from research and academia, to industrial sectors as well as government
   organizations. This event will be organized by World Research Society at the city of
   Swakopmund, Namibia."
   Pull quote: "ICSDEG provides an excellent platform to exchange knowledge, share
   innovative ideas, explore new technologies and solutions, and build valuable
   professional connections in the fields of sustainable development and economic growth."

3. slug iccrsgt-2027
   Title: International Conference on Climate Resilience, Sustainability & Green
   Technologies (ICCRSGT)
   Date: Sunday 10 January 2027, 08:30 to 15:15. City: Nairobi, Kenya.
   Organiser: Academicsworld.
   Body: "International Conference on Climate Resilience, Sustainability & Green
   Technologies (ICCRSGT), on 10th Jan 2027 at Nairobi, Kenya. The Academics World
   International Conference on Climate Resilience, Sustainability & Green Technologies
   ICCRSGT aims to bring together leading academic scientists, researchers and research
   scholars to exchange and share their experiences and research results about all aspects
   of Development in Science and Technology. It also provides the premier
   interdisciplinary forum for researchers, practitioners and educators to present and
   discuss the most recent innovations, trends, and concerns, practical challenges
   encountered and the solutions adopted in the fields of Climate Resilience,
   Sustainability & Green Technologies. This event will be organized by Academicsworld at
   the city of Nairobi, Kenya."
   Pull quote: "This important international gathering brings together academics,
   scientists, researchers, practitioners, and educators from around the world to exchange
   knowledge, share research, explore emerging technologies, and discuss practical
   solutions for a more sustainable and climate-resilient future."

EVENTS ARCHIVE (events.html). Spec content/specs/03-events-spec.pdf says the client wants
the Confevo events archive "adapted exactly as it is, including the features" and that it
is "perfect". Reference: the Confevo demo linked at
https://preview.themeforest.net/item/confevo-event-conference-wordpress-theme/full_screen_preview/63182937
(open the Events page and a single event in it with WebFetch or a browser to study the
layout). Match its structure and features, in our brand system and without its gradients:
- Page header "Archives: Events" with breadcrumb Home / Events.
- Toolbar: search field + "Find Events" button + List / Month / Day view tabs.
- Period bar: prev/next arrows, "Today" button, range label ("Now - January 2027").
- LIST view: month separator pills ("January 2027"), then each event as a row: left a date
  block (weekday "FRI" + big day number), middle "January 8, 2027 @ 08:30 - 15:30",
  title, location line with a pin icon and the country flag, excerpt, "Read More" link;
  right the cover image (rounded, 16:10). Rows grouped by month, sorted by date.
- MONTH view: a real calendar grid for the selected month with the event titles as
  clickable chips on their days; prev/next moves months. DAY view: the events of the
  selected day. Default the period to the month of the next upcoming event.
- Search filters live on title/city/country. Empty states with a friendly message and a
  link to the newsletter.
- Render all of it with js from an embedded JSON script tag generated from
  content/data/conferences.json (copy the JSON into events.html inside
  <script type="application/json" id="conference-data">) AND include server-rendered
  fallback HTML for the list view so the page works and is indexable without JS.
  Remove the old "Month view is coming soon" placeholders.

EVENT DETAIL PAGES: event-edulearn-2027.html, event-icsdeg-2027.html,
event-iccrsgt-2027.html (root level, like the venue-*.html pages). Follow the Confevo
single-event layout from the demo, in our system:
- Large photo header with the cover image, breadcrumb (Home / Events / short title), the
  date and time, title, location with flag.
- Sticky info card on desktop (right column): date, time (with "Africa/Windhoek" or
  "Africa/Nairobi" local time note), city and country, organiser, buttons
  "Register Interest" (contact.html?type=proposal&event=<slug>#contact-form) and
  "Add to Calendar" (static .ics file you generate per event in assets/calendar/), plus
  share links (LinkedIn, X, WhatsApp, email) built with URL-encoded share URLs.
- Live countdown to the start (days, hours, minutes, seconds), shows "Happening now" /
  "This event has ended" when appropriate.
- "About the conference": the body paragraphs.
- The pull quote as a large Fraunces italic quote on a sand panel.
- Gallery: the 3 gallery images in an asymmetric grid with an accessible lightbox
  (keyboard arrows, Escape, swipe, focus trap, captions). Build the lightbox as a reusable
  module, the gallery page will use it too.
- Location: Google Maps embed via the keyless URL
  https://www.google.com/maps?q=<city>,+<country>&output=embed (lazy-loaded iframe with a
  title attribute).
- "More upcoming conferences" row with the other two as image cards.
- Then the Let's Connect band, newsletter, footer.
- Add JSON-LD schema.org Event markup on each detail page (name, startDate, endDate,
  eventAttendanceMode Offline, location Place with address, image, organizer, description).

contact.html: read ?type=proposal&event=<slug>&venue=<name>&destination=<country> from the
query string and prefill the form (and select "Request a Proposal" mode if the form has
modes), so every "Register Interest"/"Request a Proposal" button lands on a ready form.

QUALITY: screenshot events.html (list and month view) and one event page at 1440 and 375px,
check keyboard use of tabs, calendar and lightbox, check the countdown in a different
timezone, validate the JSON-LD, update CLAUDE.md (conferences data file, how to add the next
conference by hand until the backend exists).
```

Commit message:
```
feat(events): first three conferences with archive and detail pages

Adds structured conference data for EDULEARN, ICSDEG and ICCRSGT, rebuilds
Events as the client's specified archive with search, list, month and day
views, and adds a detail page per conference with photo header, countdown,
gallery lightbox, map, calendar file, share links, Event schema and a
prefilled Register Interest link to the contact form.
```

---

## Prompt 3: Homepage

```
Redesign the homepage (index.html) as the showpiece of the site. The client: "the
homepage should feel a bit more lively and visually engaging", "the images should pull
through and be displayed", "not paragraphs everywhere". Act as a senior designer for a
premium destination management company: every section carries imagery, the layout has
rhythm (white / sand / navy bands), and nothing looks like a template.

Use the design system in CLAUDE.md. Hard rules: no gradients, no em dashes in copy, no
emoji. Keep the client's specified headlines and copy from
content/specs/01-home-page-spec.pdf exactly (read it first); you may add short supporting
lines, labels and captions, but never invent facts, numbers, testimonials or clients.

SECTIONS, in this order:

1. HERO. Full-viewport (min 88vh) crossfading slideshow of 5 real photos: pick the best
   event, conference-room and venue shots from assets/images/venues and the client library
   at "C:\Users\jammyy\Desktop\MICE SEGMENT\Photos" (WICC has real conference shots, also
   The Westin Cape Town conference rooms, Movenpick and Windhoek Country Club). Optimise
   them with tools/optimise-images.mjs into assets/images/hero/. Slow Ken Burns zoom,
   solid navy overlay for contrast, a small per-slide location caption bottom-left with a
   flag ("Windhoek International Convention Centre, Namibia"), slide indicators that are
   real buttons, pause on hover/focus and under reduced motion. Content: the spec
   headline in Fraunces with one italic orange word, the spec subheading, CTAs "Request a
   Proposal" (contact.html?type=proposal#contact-form) and "Explore Services".
   Overlapping the bottom edge of the hero: a white stats card with count-up numbers
   computed from what the site really contains: 9 African destinations, partner venues
   (count the partner logos), 10 services, 3 upcoming conferences. No invented numbers.

2. "One Partner. Nine Destinations. Unlimited MICE Possibilities." (spec copy) as an
   image-led bento mosaic of the 9 countries, Namibia as the large tile. Each tile: photo,
   flag, country name, one-line hook taken from that country's FAQ answer in faq.html
   (e.g. Botswana: "Exceptional wildlife and luxury safari lodges"). Hover/focus reveals
   "Plan an event in <country>" linking to contact.html?type=proposal&destination=<country>.
   Photos: Namibia and South Africa from our own library. For the other 7 the client
   explicitly allows suitable free images: download authentic location photography from
   Unsplash or Pexels (Okavango Delta/Botswana, Victoria Falls for Zambia and for
   Zimbabwe using two different viewpoints, Nairobi skyline or Maasai Mara for Kenya,
   Serengeti or Zanzibar for Tanzania, Kampala or Lake Victoria for Uganda, Kigali for
   Rwanda). Avoid cliche stock (no handshakes, no generic office). Optimise them, and log
   photographer, source URL and licence for every external photo in
   assets/images/CREDITS.md. The flag chips that are on the homepage today move into this
   mosaic (Macedo asked for each country to be represented by its flag; keep that).

3. SERVICES. Macedo sent a screenshot of the current icon-only text cards and asked for
   the images to pull through. Replace them with photo cards using
   assets/images/services: 4:3 image, a small round icon badge overlapping the bottom edge
   of the photo, title, one line, arrow link. Show 6 services in an asymmetric layout (two
   large cards on the first row, four on the second) and a "View all 10 services" link.

4. ZUSAMMEN TRAVELS ABOUT (spec copy). Text on one side, on the other an overlapping
   collage of 3 photos (different sizes, slight offsets), with the "9 African Destinations
   Served" stat as a bold orange badge pinned to the collage (big Fraunces "9", count-up).

5. UPCOMING CONFERENCES "Upcoming Conferences: In-Person, Live Agenda & Streaming" (spec
   copy) from content/data/conferences.json. Macedo sent a reference and asked that the
   images display exactly that way: on a solid navy band with the dune-lines pattern,
   each conference is a horizontal card: image on the left (with a date badge), then the
   time line with a clock icon ("08:30 - 15:30"), the title, a two-line excerpt, the
   location line with a pin and flag, and a "Read More" button on the right linking to its
   event page. Stack on mobile. "View all events" link under the cards. If one day there
   are no upcoming conferences, show an elegant empty state linking to the newsletter.

6. FEATURED VENUES. Horizontal scroll-snap carousel of the 4 venues as large photo cards
   (flag + city, venue name, "View Details"), prev/next buttons, drag/swipe, keyboard
   accessible, partial next card visible to invite scrolling.

7. FEATURED SPEAKERS (spec copy). Consent from real speakers is still pending, so keep the
   single test-run card, but make it look intentional: a portrait card styled like the
   final lineup will be, next to a sand panel "Speaker line-up announcing soon" with a
   short line and a "Get event alerts" link to the newsletter. Keep the existing TODO.

8. GALLERY STRIP "Moments from our venues": two rows of gallery photos drifting in opposite
   directions (CSS marquee, pause on hover, static under reduced motion), whole strip links
   to gallery.html.

9. LATEST FROM THE BLOG: the 3 most recent posts as image cards (cover image from
   assets/images/blog, category chip, date, reading time, title). Macedo: "the blog images
   should pull through everywhere they appear". Use the same card component that the blog
   listing uses.

10. FAQ PREVIEW: two columns. Left: a tall photo card with "Still have questions?", one
    line and a "Contact Us" button (spec: Contact Us leads to the form,
    contact.html#contact-form). Right: the 5 homepage FAQs as an accordion (keep the current
    questions), "View all FAQs" link.

11. PARTNERS: keep the existing logo marquee, restyle it to the new system with the
    heading "Trusted by leading hotels and convention centres across Africa" and a link
    "View our partner network" to partners.html.

12. Let's Connect band, newsletter panel (homepage copy), footer (all from Prompt 1).

Remove the ticket-pricing TODO block from the homepage markup into CLAUDE.md as a note
(pricing returns when a conference has real ticket prices).

QUALITY: screenshot the full homepage at 1440, 1024, 768 and 375px and critique it like an
art director: fix anything that looks empty, cramped, misaligned, text-heavy or generic,
then screenshot again. Keyboard-test slideshow, carousel and accordion. Lighthouse
(npx lighthouse or Chrome) performance and accessibility at 90+ on mobile. Update
CLAUDE.md.
```

Commit message:
```
feat(home): image-led homepage redesign

Rebuilds the homepage around a real-photo hero slideshow with live stats,
a nine-country destination mosaic with flags, photo service cards, an about
collage, the three upcoming conferences in the client's reference layout,
a venue carousel, speaker preview, gallery strip, latest blog posts, FAQ
preview and the restyled partner marquee.
```

---

## Prompt 4: Inner pages

```
Bring every inner page up to the homepage's standard. Use the design system and
components in CLAUDE.md; reuse components rather than inventing one-offs. Hard rules: no
gradients, no em dashes in copy, no emoji, never invent facts or numbers, keep client copy
from content/specs/02 to 07 (read the relevant spec before each page). Every section must
carry a visual; no stretch of plain paragraphs. Every page gets its own relevant header
photo (no repeats between neighbouring pages).

IMAGES EVERYWHERE (Macedo: "make sure the images are displaying wherever they need to;
the blog images should pull through everywhere they appear, and the same should apply to
the other sections"):
- One card component per content type (post, service, venue, conference) used everywhere
  that item appears: listings, homepage, related items, sidebars (with thumbnails),
  prev/next links. No card anywhere renders without its image. Audit with a grep and a
  screenshot pass.

SERVICES (services.html, spec 04)
- Intro with a photo, then the 10 services as alternating image/text rows: large photo,
  big outlined numeral "01".."10" in Fraunces, title, description, a short "What's
  included" list drawn from the existing copy, "Request a Proposal" button
  (?type=proposal&service=<name>). Sticky in-page service index on desktop with
  scroll-spy.
- "Regional Reach Across Africa": Macedo asked for flags here. Replace the map-pin chips
  with flag tiles (real flag SVG, country name, capital or key MICE city). Next to them an
  SVG map of Africa with our 9 countries filled in brand colours and the rest in a light
  neutral; hovering/focusing a flag tile highlights its country on the map and vice versa.
  Use a public-domain Africa country-outline SVG (Wikimedia Commons "Blank Map-Africa"
  is public domain), simplify it, credit it in assets/images/CREDITS.md. Keep the "9
  African Destinations Served" stat, styled as the orange accent badge.
  Build the map as a reusable component; partners.html uses it too.

PARTNERS (partners.html, formerly sponsors)
- H1 "Our Partners", subline from the spec copy with the word sponsors removed
  ("Zusammen Travels proudly collaborates with valued partners ...").
- Filter chips by country (assign each partner logo its country from its name; partners
  with an unclear country go under "Regional"). Logos in uniform white tiles, greyscale
  at rest and full colour on hover/focus, each with the venue name under it.
- Replace the fake ellipse "world map" and the placeholder "Event Participation
  Overview" with the Africa map component showing how many partner venues we have per
  country (computed from the logos). No invented analytics.

BLOG (blog.html + blog-01 .. blog-10.html, spec 05: check its section name and use it)
- Listing: the newest post as a wide featured card (big image, excerpt), then a 3-column
  grid of image cards, category filter chips, reading time on every card.
- Post pages: cover image header with title, date, reading time; a table of contents from
  the H2s (sticky on desktop); comfortable 68ch article measure with Fraunces pull
  quotes where the article has a strong line; share links (LinkedIn, X, WhatsApp, email);
  "Related posts" as 3 image cards; sidebar with recent posts (with thumbnails) and
  categories; prev/next post with thumbnails.

VENUES (venues.html + 4 venue pages, spec 06, follow it closely)
- Heading "Venues", slogan "Discover Spaces That Bring Events to Life", the existing intro
  paragraph. Category and country filter chips (client-side, only show filters that have
  venues). Large 2-column venue cards: photo, country with flag where the theme showed a
  price, "View Details" (never "Add to Cart").
- Each venue page: a 10-image auto-rolling gallery (prev/next, thumbnails, swipe,
  keyboard, pause on hover, reuse the lightbox) with the best 10 shots per venue picked
  from "C:\Users\jammyy\Desktop\MICE SEGMENT\Photos\<venue folder>" (skip blurry, dark or
  near-duplicate frames; optimise into assets/images/venues/<slug>/), then country label,
  the description, key facts as icon rows only where the copy already states them, a
  large "Request a Proposal" button prefilled with the venue, and "Other venues" cards.
  No cart, wishlist, category or tags meta block.

ABOUT (about.html): tell the story with images: 3-photo collage + the spec copy; "Why
Zusammen MICE" as 4 pillars each with a photo (local expertise in 9 countries, end-to-end
delivery, partner network, tailor-made programmes; use only claims already on the site);
a horizontal destinations strip with flags; a 5-step process timeline with icons
(Enquiry, Proposal, Planning, Delivery, Post-Event Evaluation); resolve the "confirm stat"
TODO by using only the confirmed "9 African Destinations Served".

GALLERY (gallery.html): masonry layout, filter chips (Venues, Events, Destinations; tag
the existing images sensibly), the shared lightbox with captions, counter and swipe.

FAQ (faq.html): the 30 questions grouped into General, Destinations, Planning and
Logistics (assign by content), a live search filter with "no results" state, sticky
"Still have questions?" photo card with Contact Us. Remove the obsolete "partner logos
pending" TODO.

CONTACT (contact.html, spec 07): split layout with a large photo on one side; the form at
#contact-form has two modes as tabs, "General Enquiry" and "Request a Proposal"
(company, destination select of the 9, event type, preferred dates, number of delegates,
budget range, venue, conference, message); prefill from the query string (built in Prompt
2); client-side validation with clear inline errors; contact cards (phone, email, Windhoek
office) with icons; embedded map of Windhoek. Keep the TODO about wiring the form to the
backend.

PRICING (pricing.html): the demo tiers ($29/mo, $199/mo, $299/mo) are theme placeholders and
"/mo" makes no sense for conference tickets. Keep the three tiers (Early Bird, Standard,
VIP) and their feature lists, but show "Price on request" with a "Request Pricing" button
(contact.html?type=proposal#contact-form), plus a conference selector label above the
tiers as the spec asks ("Tickets for: <conference>", default the first upcoming
conference). Note in CLAUDE.md that real prices are pending from the client.

404.html: full photo background, short friendly message, links to Home, Venues and Events
(GitHub Pages serves 404.html automatically).

QUALITY: screenshot every page at 1440 and 375px, fix anything empty, cramped,
misaligned or text-heavy, re-screenshot. Check every link (write a small node script or
use a link checker over the folder). Update CLAUDE.md with what changed and which of
Macedo's points are done.
```

Commit message:
```
feat: image-rich inner pages and client round 3 fixes

Rebuilds Services, Partners, Blog, Venues, About, Gallery, FAQ, Contact,
Pricing and 404 on the new design system. Adds flag tiles and an
interactive Africa map to Regional Reach, a partner network filtered by
country, ten-image venue galleries, table of contents and related posts on
articles, a two-mode contact form prefilled from any Request a Proposal
button, and makes post, service, venue and conference images appear
wherever those items are listed.
```

---

## Prompt 5: Designer QA pass

```
Do a final review of the whole site as a demanding art director and front-end lead
before it goes back to the client. Read CLAUDE.md.

1. Visual: screenshot all pages at 1440, 1024, 768 and 375px. For each page list what
   looks generic, empty, cramped, misaligned, inconsistent (spacing, radii, shadows, type
   sizes, button styles) or text-heavy, then fix it. Check that every page alternates
   surfaces and that no two neighbouring pages reuse the same header photo.
2. Content rules: grep for em dashes, emoji, gradients (linear-gradient, radial-gradient,
   conic-gradient), the old #1d4ed8 blue, "Sponsor", "lorem", "$29", "/mo", "TODO" (list
   the remaining TODOs and confirm each is intentional), broken images and empty alt
   attributes on content images.
3. Accessibility: keyboard-only pass through nav, dropdown, mobile menu, slideshow,
   carousels, tabs, calendar, accordion and lightbox; visible focus everywhere; landmarks
   and heading order; colour contrast AA; prefers-reduced-motion disables all motion.
4. Performance: Lighthouse mobile on index, events, one event page, venues, one venue,
   one blog post, contact. Target 90+ performance and 95+ accessibility. Check image
   weights (nothing above 350KB delivered on mobile), font preloads, layout shift.
5. SEO basics: unique title and meta description per page, Open Graph title, description
   and image per page (use that page's header photo), canonical URLs for
   https://tsegale.github.io/mice-namibia/, a sitemap.xml and robots.txt that disallows
   indexing for now (the client only launches next year).
6. Write a short REVIEW-NOTES.md for the client listing what changed this round (in plain
   language, mapped to his numbered requests) and what is still waiting on him (revised
   logo, ICENLT vs EDULEARN, ticket prices, speaker consent, team photos after hiring,
   WhatsApp number).
```

Commit message:
```
chore: design QA, accessibility and performance pass

Fixes layout and consistency issues found in a full-site screenshot review,
completes keyboard and reduced-motion support, tunes image weights and font
loading, adds per-page meta and Open Graph tags, sitemap and a noindex
robots.txt, and adds review notes for the client.
```

After this, push and send Macedo the link together with the open questions at the top of
this file.

---

# PHASE 2: BACKEND (Node + Express)

Start once Macedo has signed off on the look. Macedo's requirement: conferences, blog posts,
speakers and every other section from the first handover must be editable from a backend.

## Prompt 6: Port the redesigned site to Express + EJS + MySQL

```
This static site now becomes a database-driven Node app so the client (Macedo) can manage
the content himself. Read CLAUDE.md and content/specs/03-events-spec.pdf,
05-blogs-spec.pdf and 06-venues-spec.pdf first; the backend requirements are written in
those specs.

Goal of THIS step: port the redesigned site 1:1 onto Express + EJS + MySQL with a complete
data model and seeded content. Do not change the design; rendered pages must look the same
as the static version (compare with Playwright screenshots before/after).

STACK (our usual Node/Express pattern, keep it cPanel/Passenger friendly: no native
modules except sharp):
- Node 20 LTS, Express 5, EJS views with layout + partials (header, footer, newsletter,
  lets-connect, cards per content type, picture/image helper)
- MySQL/MariaDB via Knex (mysql2) with versioned migrations and seeds
- dotenv, helmet (real CSP), compression, morgan, express-session +
  express-mysql-session, csrf-csrf (double submit), express-rate-limit, zod, sanitize-html,
  marked, slugify, bcryptjs, multer + sharp, nodemailer
- ESLint + Prettier, Vitest + Supertest
- docker-compose.yml with MariaDB 10.11 + Adminer for local dev, .env.example, npm
  scripts: dev (nodemon), start, migrate, seed, test, lint, export

STRUCTURE
- app.js at root (Passenger), src/{routes,controllers,services,repositories,middleware,
  views,lib}, public/{css,js,assets,fonts}, public/uploads (gitignored except .gitkeep),
  db/{migrations,seeds}, scripts/. Move css/js/assets into public/ with git mv to keep
  history. tools/optimise-images.mjs logic becomes src/lib/images.js used on upload.

DATA MODEL (every content table: id, slug where public, sort_order, status
draft|published, created_at, updated_at):
- settings (key, JSON value): contact details, social links, homepage toggles
  (show_speakers, show_team, show_pricing), pricing_conference_id, SEO defaults
- destinations (the 9 countries): name, iso2, flag, hero_image, hook, description
- services (10): title, short_description, body, included JSON, image, icon_svg,
  featured_on_home
- venue_categories (the 10 from the venues spec) and venue_tags (the 41 product
  categories from the venues spec, exactly as written), venues (name, destination_id,
  category_id, description HTML, address, facts JSON, map_embed_url, cover_image),
  venue_tag pivot, venue_images (ordered, up to 20)
- conferences: title, short_title, starts_at, ends_at, timezone, format, city,
  destination_id, organiser, excerpt, body, pull_quote, cover_image, registration_url,
  featured; conference_images; conference_sessions (agenda); conference_ticket_tiers
  (name, price nullable = "Price on request", currency, features JSON, cta)
- speakers: name, role, organisation, bio, photo, socials JSON, consent_confirmed,
  is_preview; conference_speaker pivot. A speaker is public only when published AND
  consent_confirmed (or is_preview while no real speaker exists).
- posts (blog): title, excerpt, body markdown, cover_image, author_name, category_id,
  tags, published_at (future = scheduled), seo_title, seo_description; post_categories
- faqs (question, answer, group, show_on_home), partners (name, logo, website_url,
  destination_id nullable, show_on_home), gallery_items (image, caption, category),
  team_members (hidden by setting), pages (slug, title, body markdown, effective_date)
- submissions (type contact|proposal, fields JSON, status new|read|archived, ip, ua),
  subscribers (email, token, confirmed_at, unsubscribed_at)
- admin_users (name, email, password_hash, role admin|editor, last_login_at), audit_log

SEEDS (from what the site has, nothing invented): conferences from
content/data/conferences.json with their images; 10 posts from content/blogs/*.md with
covers; 10 services; 4 venues with their 10-image galleries; 9 destinations with hooks;
30 FAQs with groups and the 5 homepage ones flagged; all partners with countries; gallery
items with categories; privacy-policy and terms-and-conditions from content/legal/*.md
VERBATIM; the preview speaker; settings from the footer/contact page.

ROUTES
- Clean URLs: /, /about, /services, /services/:slug, /venues, /venues/:slug, /events,
  /events/:slug, /events/:slug.ics, /blog, /blog/:slug, /gallery, /faq, /partners,
  /pricing, /contact, /privacy-policy, /terms-and-conditions, /team (404 while hidden)
- 301 redirects from EVERY old .html URL (index.html, event-*.html, blog-01.html,
  sponsors.html, partners.html ...) to its new URL so links already sent keep working.
- POST /contact (both modes), /newsletter: zod validation, CSRF, honeypot, rate limit,
  store to DB, email via nodemailer (SMTP from .env), flash message.
- sitemap.xml and robots.txt from the DB (noindex while SITE_ENV=staging).
- 404 and 500 views in the design system.

STATIC PREVIEW EXPORT (the client still reviews on GitHub Pages):
- scripts/export.js boots the app, crawls every public route (route list built from the
  DB), writes HTML to /docs with BASE_PATH=/mice-namibia so links and assets work under
  the subpath, copies public/, adds .nojekyll, emits the old *.html names as redirect
  stubs. In the export, forms show "Preview build: forms are live on the production
  site". After pushing, switch GitHub Pages to serve master /docs.

QUALITY: Supertest smoke tests (every route 200, legacy URLs 301 correctly, form
validation, CSRF rejection), screenshot comparison static vs Express, update CLAUDE.md
(new stack, folder map, how to run locally; keep every design rule).
```

Commit message:
```
feat: port site to Express, EJS and MySQL with full content model

Moves every page onto shared EJS layouts and partials, adds Knex migrations
and seeds for conferences with agenda and ticket tiers, speakers with
consent gating, posts, venues with categories and tags, destinations,
services, FAQs, partners, gallery, team, legal pages, submissions and
subscribers. Legacy .html URLs redirect to clean routes and a static export
to /docs keeps the GitHub Pages review link working.
```

## Prompt 7: Admin CMS

```
Build the admin backend at /admin so Macedo (non-technical, plans to post weekly) can
manage every content section himself. Server-rendered EJS using the same design tokens as
the public site; calm, clean admin UI, no SPA framework.

AUTH AND SECURITY: email + password (bcryptjs cost 12), rate limited, lockout after 5
failed attempts for 15 minutes, session regeneration on login, secure/httpOnly/sameSite
cookies, CSRF on every form, roles (admin, editor: editors cannot manage users or
settings), password change, forgot-password via emailed one-time token,
`npm run create-admin` CLI, every create/update/delete written to audit_log.

DASHBOARD: counts (published posts, upcoming conferences, venues, new submissions),
recent submissions, scheduled posts, quick actions (New post, New conference, New venue).

MODULES (list with search, filters, pagination, status badges; edit form; preview link;
draft/published; drag-to-reorder where sort_order exists with self-hosted SortableJS):
- Blog posts: Quill editor (self-hosted, sanitised server-side), cover image, category,
  tags, excerpt, SEO fields, scheduling via published_at.
- Conferences: details, cover + gallery images, featured toggle (warn above 3), agenda
  repeater, ticket tier repeater (empty price = "Price on request"), speaker multi-select.
- Speakers: photo, bio, socials, consent_confirmed; publishing without consent is blocked
  with a clear message.
- Venues: country (the 9), category (10), product categories multi-select (41) with
  type-to-search, rich description, facts, map embed, gallery uploader with drag-and-drop
  ordering (hint: aim for 10 images).
- Services, Destinations, FAQs (group, show on homepage), Partners (logo, country, show on
  homepage), Gallery (bulk upload, captions, category), Team members, Pages (legal text in
  a markdown editor with preview).
- Settings: contact details, social links, homepage toggles, pricing conference, SEO.
- Submissions inbox (filter, detail, mark read/archived, reply via mailto, CSV export),
  Subscribers (list, CSV export, unsubscribe), Users (admin only).

UPLOADS: multer with size limits, type checked by magic bytes, random filenames; sharp
makes WebP + JPG at 640/1280/1920 plus a thumbnail in public/uploads/<module>/; deleting
an item removes its files; if sharp is unavailable on the host, store the original and log
a warning instead of crashing.

QUALITY: Vitest/Supertest for login, lockout, CSRF, roles, and create/edit/delete of posts,
conferences and venues. Write ADMIN-GUIDE.md for Macedo in plain language with
screenshots: log in, add a conference with gallery, agenda and tickets, publish or schedule
a weekly post, add a venue with its 10 photos, publish a speaker once consent is in, read
form submissions.
```

Commit message:
```
feat(admin): content management backend for the client

Adds a session-authenticated admin with roles, lockout, CSRF and audit log,
plus modules for posts, conferences with agenda and ticket tiers, speakers
with consent gating, venues with categories and tags, services,
destinations, FAQs, partners, gallery, team, legal pages, settings,
submissions and subscribers. Uploads are validated and resized to WebP and
JPG. Includes an admin guide for the client.
```

## Prompt 8: Staging deploy, SEO and handover docs

```
Prepare the app for a staging deploy on our cPanel hosting (same approach as the main
Zusammen site) and for the public launch next year.

DEPLOY: Passenger entry (app.js), cPanel "Setup Node.js App" steps, production .env (DB,
SESSION_SECRET, SMTP on the corporate.events@zusammentravels.com mailbox, BASE_URL),
npm ci --omit=dev, migrations on deploy, persistent public/uploads, sharp install notes,
log rotation. Staging must not be indexed: X-Robots-Tag noindex + robots.txt disallow when
SITE_ENV=staging, optional HTTP basic auth via env. Write DEPLOY.md with exact cPanel
steps and a rollback procedure.

SEO (for launch): per-page title/meta from the DB with defaults, canonical URLs, Open
Graph and Twitter cards with each page's image, sitemap.xml from the DB, JSON-LD
(Organization, Event for conferences, Article for posts, Place for venues).

PERFORMANCE AND SECURITY: long cache headers for fingerprinted static assets, gzip/brotli,
security headers verified (CSP without unsafe-inline where possible), Lighthouse 90+ mobile
on home, events, one event, venues, one venue, one post and contact; npm audit clean of
high/critical.

DOCS: README.md (overview, stack, local setup with Docker, scripts, folder map, GitHub
Pages export, deploy). Update CLAUDE.md to the final state.
```

Commit message:
```
chore: staging deploy setup, SEO metadata and project docs

Adds Passenger-ready production config, noindex and optional basic auth for
staging, sitemap, canonical and Open Graph tags, JSON-LD for organisation,
events, articles and venues, caching and security headers, and README and
DEPLOY guides.
```
