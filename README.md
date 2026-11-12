# MICE Namibia website

[![CI](https://github.com/tsegale/mice-namibia/actions/workflows/ci.yml/badge.svg?branch=phase-2-backend)](https://github.com/tsegale/mice-namibia/actions/workflows/ci.yml?query=branch%3Aphase-2-backend)

The website and admin panel for Zusammen Tours and Travel Agency's MICE
segment (Meetings, Incentives, Conferences and Exhibitions) across Namibia,
Botswana, South Africa, Zambia, Zimbabwe, Kenya, Tanzania, Uganda and Rwanda.

- Public site: every page is rendered on the server from the database, so
  content is in the HTML for search engines and works without JavaScript.
- Admin panel at `/admin`: events, venues, blog articles, speakers, contact
  enquiries, newsletter subscribers and admin accounts (admins manage users;
  editors manage content and the inbox). Later phases add the remaining
  pages (FAQs, gallery, partners, team, settings).

Design rules, client decisions and open content questions live in
`CLAUDE.md` and `REVIEW-NOTES.md`.

## Stack

Node.js 22 + Express 5, EJS templates, MySQL/MariaDB through Knex
(versioned migrations), sessions stored in the database, sharp for image
resizing, nodemailer for email, zod for validation. One process serves
everything (pages, admin, uploads), which is what cPanel "Setup Node.js App"
(Passenger) runs: the entry file is `app.js`.

## Run it locally

You need Node.js 22 LTS and a MySQL or MariaDB server.

1. **Database.** Either run `docker compose up -d` (MariaDB 10.11, creates
   the `mice` and `mice_test` databases), or use your own server (XAMPP,
   MySQL Installer) and create them yourself:

   ```sql
   CREATE DATABASE mice CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE mice_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'mice'@'localhost' IDENTIFIED BY 'choose-a-password';
   GRANT ALL PRIVILEGES ON mice.* TO 'mice'@'localhost';
   GRANT ALL PRIVILEGES ON mice_test.* TO 'mice'@'localhost';
   ```

2. **Settings.** Copy `.env.example` to `.env` and fill in the database
   details and a `SESSION_SECRET` (the file explains how to make one). The
   app checks every setting when it starts and says exactly what is wrong.

3. **Install, build the tables, load the content, make your login:**

   ```
   npm install
   npm run migrate
   npm run seed
   npm run create-admin -- --email you@example.com --name "Your Name"
   npm run dev
   ```

4. Open http://localhost:3000 for the site and http://localhost:3000/admin
   for the admin panel.

`npm run seed` loads the reviewed content (3 conferences, 4 venues, 10
articles, sample speakers, destinations, redirects from the old `.html`
addresses). It only adds what is missing, never overwrites edits, and
refuses to run against production unless given `--allow-production`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start and restart on code changes |
| `npm start` | Start (production) |
| `npm run migrate` | Apply new database migrations |
| `npm run migrate:status` | List applied and pending migrations |
| `npm run seed` | Load the starter content (safe to re-run) |
| `npm run create-admin` | Add an admin login, or reset its password |
| `npm run test-email` | Check the SMTP settings and send a test message |
| `npm test` | Run the test suite against `mice_test` (wiped every run) |
| `npm run lint` | ESLint |

## Where things are

```
app.js                    Entry point (Passenger loads this)
src/config.js             Settings from .env, validated at start-up
src/app.js                Express app: security headers, sessions, routes
src/db/migrations/        Database schema, one file per change
src/db/seeds/             Starter content loader
src/routes/public.js      Public pages
src/routes/forms.js       Contact form and newsletter (with and without JS)
src/routes/admin/         Admin panel, one file per section
src/repositories/         Database reads shared by pages
src/services/             Login, slugs, email, enquiries, subscribers
src/validation/           Form rules and their messages
src/views/pages/          Public page templates
src/views/partials/       Shared header, bands, footer
src/views/components/     Cards and lists used on several pages
src/views/admin/          Admin templates
public/                   CSS, JS, fonts and images served as-is
storage/uploads/          Uploaded images (not in git; back it up)
content/                  Client briefs, articles and seed data (not served)
tests/                    API tests (node:test + supertest)
```

## Email

Contact-form enquiries are always saved in the admin inbox first, then
emailed to `MAIL_TO` with Reply-To set to the visitor, so replying from the
mailbox answers them directly. If the mail server is down the enquiry is
kept and marked "Email failed", with a button to send it again. With
`SMTP_HOST` empty (local development) nothing is sent and enquiries are
marked "Email not set up". Run `npm run test-email` after changing the SMTP
settings.

Newsletter sign-ups are stored and exported from Admin > Subscribers as CSV
for the mailing tool the team uses; the site does not send newsletters
itself. Each subscriber has a private unsubscribe link,
`/newsletter/unsubscribe/<token>`, for use in mailings.

## Continuous integration

`.github/workflows/ci.yml` runs `npm ci`, `npm run lint` and `npm test` on
Node 22 against a MariaDB 10.11 service container, on every push to
`phase-2-backend` and on pull requests (not on `master`, which is still the
static GitHub Pages build). Test settings come from the workflow itself; no
secrets are needed.

## Deploying (outline, host still to be chosen)

1. Create the MySQL database and user in cPanel.
2. Upload the code (without `node_modules`, `.env` and `storage/uploads`),
   then in "Setup Node.js App" choose Node 22, application root, startup
   file `app.js`, and run `npm install` there.
3. Create `.env` on the server with `NODE_ENV=production`, the real
   `BASE_URL`, database, SMTP and a new `SESSION_SECRET`. Set
   `SITE_ENV=staging` (and optionally `STAGING_BASIC_AUTH`) for a test site,
   so search engines are told to stay away.
4. `npm run migrate`, `npm run seed -- --allow-production` once,
   `npm run create-admin`, then restart the app.
5. Back up the database and `storage/uploads` together.

## Lessons from the Zusammen build, applied here

- One origin for site, admin and API: no CORS, no second host to keep in sync.
- Pages rendered on the server, not filled in by browser fetches that can race or fail.
- The same field names in forms, validation and the database.
- MySQL with versioned migrations instead of an in-memory database and ad-hoc `ALTER`s.
- Seeds that never delete or overwrite, and refuse production by default.
- Admin users in the database, no default password, account lockout, rate-limited
  login, new session id on login, CSRF tokens, secrets never logged.
- Settings validated at start-up instead of failing later at random.
- Uploads checked by content, renamed, resized to WebP and JPG, stored outside the code.
- Rich text cleaned on the server; everything else escaped by the templates.
- Enquiries saved before the email is attempted, and the result recorded.
- Changed web addresses keep working through 301 redirects (no chains).
- `.env`, `node_modules` and uploads kept out of git from the first commit.
