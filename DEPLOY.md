# Deploying to cPanel (staging and production)

How the staging site at **https://staging.zusammentravels.com** was set up
(12 Nov 2026) on the client's Namhost cPanel account, and how to update it.
The host runs LiteSpeed with cPanel's **Application Manager** (Phusion
Passenger) for Node apps, Node 22 from cPanel's `ea-nodejs22` package and
MariaDB 10.11. There is no "Setup Node.js App" (CloudLinux) on this account.

Production (**https://mice.zusammentravels.com**, live since 22 Nov 2026)
was built with the same steps and runs side by side with staging on the same
account, sharing nothing but the code. See [Production](#production) for its
names and paths; every command in this guide works for it after swapping
`~/mice-staging` for `~/mice-production` and `~/mice-data` for
`~/mice-production-data`.

The same cPanel account also runs the client's live Zusammen site
(`zusammentravels.com` in Application Manager) and its backend. Never touch
those folders or that app.

| Placeholder | Meaning |
| --- | --- |
| `<cpuser>` | The cPanel username (cPanel > General Information > Current User), home `/home/<cpuser>` |
| `~/mice-staging` | App root: the git checkout, outside `public_html` |
| `~/mice-data/uploads` | Uploaded images, outside the app root |
| `~/mice-data/backups` | Daily backups, outside the app root |

Keeping uploads and backups outside the app root means a redeploy (or
deleting and re-cloning the checkout) never touches them.

## Node 22 in the terminal (read this first)

Plain `node` on this server is an old v10. Application Manager runs the app
with Node 22, and every command you type must use the same one. Start every
Terminal or SSH session with:

```bash
export PATH=/opt/cpanel/ea-nodejs22/bin:$PATH
cd ~/mice-staging
node -v    # must print v22.x
```

Every `npm` command below assumes this.

## 1. Subdomain and HTTPS

1. cPanel > **Domains** > Create: `staging.zusammentravels.com`. Let cPanel
   pick the document root. Passenger's settings go there; it is not the app
   root and nothing else goes in it. (Terminal equivalent:
   `uapi SubDomain addsubdomain domain=staging rootdomain=zusammentravels.com dir=staging.zusammentravels.com`.)
2. cPanel > **SSL/TLS Status** > **Run AutoSSL** (or `uapi SSL
   start_autossl_check`). Check `curl -sI https://staging.zusammentravels.com`
   shows no certificate error before going on: the app only sets secure
   cookies, so a login over plain HTTP will not stick.

## 2. Database and user

cPanel > **Manage My Databases**:

1. Create the database `<cpuser>_mice_staging` (cPanel adds the prefix).
2. **Add New User** `mice` (becomes `<cpuser>_mice`) with a generated
   password. Regenerate if it contains `'` or `"`: the backup script cannot
   pass a password with a double quote, and the `.env` line uses single
   quotes.
3. **Add User To Database** > **ALL PRIVILEGES**.

## 3. Get the code onto the server

The repository is public, so the server clones over HTTPS with no key:

```bash
git clone --branch phase-2-backend https://github.com/tsegale/mice-namibia.git ~/mice-staging
mkdir -p ~/mice-data/uploads ~/mice-data/backups
chmod 755 ~/mice-data/uploads
chmod 700 ~/mice-data/backups
```

If the repository is ever made private, add a **read-only deploy key**:
`ssh-keygen -t ed25519 -f ~/.ssh/mice_deploy -N ""`, paste
`~/.ssh/mice_deploy.pub` into GitHub > Settings > Deploy keys (write access
off), point `~/.ssh/config` at it for `github.com`, and switch the remote with
`git remote set-url origin git@github.com:tsegale/mice-namibia.git`. Never
put a personal key on the server.

`.env` is never uploaded or committed. It is created on the server (step 5)
and git ignores it, so pulls never overwrite it.

## 4. Install

```bash
npm ci --omit=dev
```

Exactly what `package-lock.json` lists, without the development tools. The
app logs plain JSON in production and never needs pino-pretty. Check sharp
works on this server (it did on 12 Nov 2026):

```bash
node -e "require('sharp')({create:{width:2,height:2,channels:3,background:'#fff'}}).webp().toBuffer().then(()=>console.log('sharp ok'))"
```

## 5. The staging `.env`

Create `~/mice-staging/.env` (`nano .env`) and `chmod 600 .env`:

```ini
NODE_ENV=production
SITE_ENV=staging
TRUST_PROXY=true
BASE_URL=https://staging.zusammentravels.com

DB_HOST=localhost
DB_PORT=3306
DB_NAME=<cpuser>_mice_staging
DB_USER=<cpuser>_mice
DB_PASSWORD='<the password from step 2>'

# New for this server, never reused. Make it on the server so it is never
# shown on screen or copied anywhere:
#   node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=<64 hex characters>

# Absolute paths outside the app root, so redeploys never touch them.
UPLOADS_DIR=/home/<cpuser>/mice-data/uploads
BACKUP_DIR=/home/<cpuser>/mice-data/backups
UPLOAD_MAX_MB=12

# The mice@zusammentravels.com mailbox (cPanel > Email Accounts > Connect
# Devices shows the outgoing server and port): SMTP_USER and MAIL_FROM are
# that address, SMTP_PASS its password, typed into .env on the server only.
# Empty = enquiries are saved in the admin but not emailed.
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
# Fallback recipient for contact-form notifications. Once addresses are set
# in Admin > Settings > Enquiry emails, those are used instead.
MAIL_TO=

# Browser password for the whole staging site, user:password.
STAGING_BASIC_AUTH=<user>:<long random password>

LOG_LEVEL=info
```

- `SITE_ENV=staging` makes `robots.txt` say `Disallow: /` and adds a
  `noindex` header to every response. `npm run doctor` checks the two agree.
- `STAGING_BASIC_AUTH` covers everything except `/healthz`, so the uptime
  monitor works without the password.
- Leave Application Manager's environment variables empty: all settings live
  in `.env`, one place to check.

## 6. Register the app

cPanel > **Application Manager** > **Register Application**:

| Field | Value |
| --- | --- |
| Application Name | `mice-staging` |
| Deployment Domain | `staging.zusammentravels.com`, base path `/` |
| Application Path | `mice-staging` (relative to the home folder) |
| Deployment Environment | Production |
| Environment Variables | none |

Click **Deploy**. Passenger finds `app.js` in the application path by
itself. Do not click **Ensure dependencies**: it runs a plain `npm install`,
which can change the lock file and add development packages; step 4 already
installed exactly what is needed.

## 7. First run

```bash
npm run migrate                          # build the tables
npm run seed -- --allow-production       # starter content, once
npm run create-admin -- --email you@example.com --name "Your Name"
npm run doctor                           # must end with 0 failed
mkdir -p tmp && touch tmp/restart.txt    # restart under Passenger
curl -s https://staging.zusammentravels.com/healthz
# {"status":"ok","db":"ok","migrations":"ok"}
```

`create-admin` asks for the password (hidden); there is no default login.

Signing in at `https://staging.zusammentravels.com/admin` asks twice: first
the browser pop-up (the `STAGING_BASIC_AUTH` user and password), then the
admin page (the email and password from `create-admin`). Give Macedo the
staging password and his own login from **Admin > Users**; never share yours.

`npm run doctor` checks: settings load, database reachable, no pending
migrations, at least one active admin, `UPLOADS_DIR` and `BACKUP_DIR`
writable, sharp can make WebP, SMTP login (a warning while SMTP is empty),
and in production that `BASE_URL` is https, `SESSION_SECRET` is not a
placeholder and `TRUST_PROXY` is on, and that `robots.txt` matches
`SITE_ENV`. It exits 1 on any failure, so it can gate a deploy.

`npm run test-email` sends one test message, once SMTP is set, to whoever
receives enquiries: the addresses in Admin > Settings > Enquiry emails, or
`MAIL_TO` while those are empty.

## 8. Daily backup (cron)

In place since 12 Nov 2026 (cPanel > **Cron Jobs**, 02:15 server time):

```
15 2 * * * /bin/bash /home/<cpuser>/mice-staging/scripts/backup.sh
```

Set **Cron Email** on that page to an inbox someone reads: the script is
silent when it works, so cron only emails on failure. The account's other
cron job (Softaculous's WordPress backup) belongs to the main site; leave it.

Each run writes to `BACKUP_DIR`:

- `db-<UTC date-time>.sql.gz`: `mysqldump --single-transaction` of the
  database (a consistent snapshot, no locking of the live site)
- `uploads-<UTC date-time>.tar.gz`: the whole `UPLOADS_DIR`
- `backup.log`: one line per step, appended

Files older than 14 days are deleted. The database password goes to
mysqldump through a temporary option file (mode 600, removed afterwards), so
it never appears in the process list. `bash scripts/backup.sh` runs one by
hand.

The backups sit on the same server as the site. Download one now and then
(File Manager), or check what the account's JetBackup already keeps.

## 9. Uptime check

Production has an on-server check (cron, every 5 minutes):

```
*/5 * * * * /opt/cpanel/ea-nodejs22/bin/node /home/<cpuser>/mice-production/scripts/uptime-check.js
```

`scripts/uptime-check.js` reads `<BASE_URL>/healthz` and emails `MAIL_TO`
(from `.env`, so it works while the database is down) after two failed checks
in a row, and once more when the site recovers. Nothing is sent while the
state holds; the state is `BACKUP_DIR/uptime-state.json`. It runs on the same
server as the site, so it cannot report the whole server going offline. For
that, add an external monitor as well:

Any HTTP monitor (UptimeRobot, Better Stack):

- URL: `https://staging.zusammentravels.com/healthz`
- Alert when the status is not 200, or the body does not contain
  `"status":"ok"`
- Every 5 minutes

The response says only `ok`, `down`, `pending` or `unknown` for the app,
the database and the migrations, with HTTP 503 when the database is down or
a migration has not been run. It shows no versions, hostnames or errors and
needs no password.

## 10. Deploying an update

Optionally tag what you deploy, so there is a named version to go back to
(on your machine: `git tag -a staging-2026-11-20 -m "..."` and push the
tag). Then in the cPanel Terminal:

```bash
export PATH=/opt/cpanel/ea-nodejs22/bin:$PATH
cd ~/mice-staging
git rev-parse --short HEAD        # write this down (for rollback)
bash scripts/backup.sh            # fresh backup in case a migration runs
git pull --ff-only                # or: git fetch --tags && git checkout staging-2026-11-20
npm ci --omit=dev
npm run migrate
npm run doctor
touch tmp/restart.txt
curl -s https://staging.zusammentravels.com/healthz
```

CSS and JS links carry `?v=<commit>`, so visitors get the new styles right
after the restart even though static files are cached for a day.

If `npm run doctor` fails, fix what it names before the `touch`. (A
migration that already ran is not undone by that; see Rollback.)

### When an update adds seed content

Some updates also add starter content: the release notes (commit messages)
say so. Run the seed after the migration and before the restart:

```bash
npm run migrate
npm run seed -- --allow-production
```

The seed only adds what is missing and never changes or restores anything
edited or deleted in the admin, so running it when nothing is new is
harmless.

### The Phase 3 content update (Nov 2026)

Destinations, site settings, team, pricing and legal pages became editable.
On staging this update needs both steps above:

- `npm run migrate` adds migrations 007 to 010 (destination details, team
  members, ticket tiers and prices, legal document versions).
- `npm run seed -- --allow-production` fills in the destination details,
  adds the three ticket tiers (no prices) and version 1 of the Privacy
  Policy and the Terms from `content/legal/*.md`, each once.

Then, signed in as an admin:

1. **Settings > Site settings > Enquiry emails**: enter who receives the
   contact form, or leave it empty to keep using `MAIL_TO`. Check with `npm
   run test-email`.
2. **Settings > Legal pages**: both documents show version 1, effective 01
   January 2027. `/privacy-policy` and `/terms-and-conditions` look exactly
   as before.
3. **Pages > Team** and the price table under **Events** stay empty until
   the client sends real content; the site keeps its placeholders and
   "Price on request" until then.

### The site email address (Nov 2026)

The site's address is **mice@zusammentravels.com** (the default in the code
since 20 Nov 2026). An address saved earlier in **Settings > Site settings >
Contact details** overrides the default, so check it reads
mice@zusammentravels.com there.

Outgoing mail uses the same mailbox. In `~/mice-staging/.env`:

```ini
SMTP_USER=mice@zusammentravels.com
SMTP_PASS='<the mailbox password>'
MAIL_FROM="MICE Namibia <mice@zusammentravels.com>"
```

Then `touch tmp/restart.txt` and `npm run test-email`. The password goes
only into `.env` on the server (mode 600); never commit, email or paste it
anywhere else.

The Privacy Policy and the Terms still name corporate.events@zusammentravels.com
in their contact clauses. That text is the client's; change it only by
publishing a new version he supplies (Settings > Legal pages).

## 11. Rollback

```bash
git checkout <the commit you wrote down>
npm ci --omit=dev
```

If the update ran no migration, that is all: `npm run doctor`, then `touch
tmp/restart.txt`.

If it ran a migration, the old code does not match the new tables. Restore
the backup taken just before the update (next section), then `npm run
doctor` and `touch tmp/restart.txt`. Restoring loses anything saved on the
site since that backup (enquiries, edits), so export new enquiries from the
admin first if there are any.

To get back onto the branch afterwards: `git checkout phase-2-backend`.

## Restore a backup

Pick the files (newest first):

```bash
ls -t ~/mice-data/backups/db-*.sql.gz | head
ls -t ~/mice-data/backups/uploads-*.tar.gz | head
```

**Database.** Empty the database first, so tables created by a newer
migration do not linger, then load the dump. Each `mysql` call asks for the
database password (typed, not on the command line):

```bash
DB=<cpuser>_mice_staging; U=<cpuser>_mice
mysql -u "$U" -p "$DB" -N -e "SELECT CONCAT('DROP TABLE IF EXISTS \`', table_name, '\`;') FROM information_schema.tables WHERE table_schema = DATABASE()" > /tmp/drop-all.sql
(echo 'SET FOREIGN_KEY_CHECKS=0;'; cat /tmp/drop-all.sql) | mysql -u "$U" -p "$DB"
gunzip -c ~/mice-data/backups/db-<stamp>.sql.gz | mysql -u "$U" -p "$DB"
rm /tmp/drop-all.sql
```

(phpMyAdmin works too: select the database, **Check all** tables, **Drop**,
then **Import** the `.sql.gz` file.)

**Uploads.** Move the current folder aside, then unpack (the archive holds
one `uploads/` folder):

```bash
mv ~/mice-data/uploads ~/mice-data/uploads.before-restore
tar -xzf ~/mice-data/backups/uploads-<stamp>.tar.gz -C ~/mice-data/
```

Then `npm run doctor`, `touch tmp/restart.txt`, and once the site looks
right, delete `uploads.before-restore`.

To try a backup without touching the live data, create a second database in
cPanel (for example `<cpuser>_mice_restore`), load the dump into that, and
compare `SELECT COUNT(*)` per table. This round trip (backup, restore into a
scratch database, row counts and uploads compared) was checked against the
docker-compose MariaDB 10.11.

## Production

Set up on 22 Nov 2026 with sections 1 to 10 above. Staging stays up behind
its password for testing changes before they reach production.

| | Staging | Production |
| --- | --- | --- |
| Address | https://staging.zusammentravels.com | https://mice.zusammentravels.com |
| Document root (Passenger only) | `~/staging.zusammentravels.com` | `~/mice.zusammentravels.com` |
| Application Manager name | `mice-staging` | `mice-production` |
| App root (git clone of `phase-2-backend`) | `~/mice-staging` | `~/mice-production` |
| `UPLOADS_DIR` | `~/mice-data/uploads` | `~/mice-production-data/uploads` |
| `BACKUP_DIR` | `~/mice-data/backups` | `~/mice-production-data/backups` |
| Database | `<cpuser>_mice_staging` | `<cpuser>_mice_prod` |
| Database user | `<cpuser>_mice` | `<cpuser>_miceprod` |
| `SITE_ENV` | `staging` (noindex, `Disallow: /`) | `production` (indexable) |
| `STAGING_BASIC_AUTH` | set | not set |
| Backup cron | 02:15 | 02:45 |
| Uptime check | none | `scripts/uptime-check.js`, every 5 minutes |

Cron Email on this account is empty (`MAILTO=""` in the crontab), so cron
mails nobody and a failing backup only shows in `backup.log`. Set an address
under cPanel > **Cron Jobs** > Cron Email to get those failures by email. The
uptime check does not depend on it; it sends its own email.

Production `.env` differs from staging only in the lines above, its own
`DB_PASSWORD` and `SESSION_SECRET` (both generated on the server, never shown
or reused) and no `STAGING_BASIC_AUTH`. SMTP is the same mice@ mailbox.

**How the content got there.** Production started as a copy of staging, not a
fresh seed: a staging backup (`bash scripts/backup.sh`) was loaded into the
empty production database, the uploads archive unpacked into
`~/mice-production-data/uploads`, and the row count of every table (32) and
the checksum of every upload (408 files) compared. `npm run migrate` then
had nothing to do. Do not run the seed against production to "top up"
content; it is only needed when an update's release notes say so (section 10).

**Accounts.** admin@mice.com is deactivated. The client's admin account was
given a new temporary password with "must change password" set; the panel
makes them choose their own at first login. If they lock themselves out,
**Admin > Users > Unlock** or **Reset password** from another admin account.

**Deploying an update to production.** Deploy to staging first and check it
there. Then section 10 with `cd ~/mice-production` and the production
address in the `curl` line.

**Old addresses.** The static review build on GitHub Pages
(`tsegale.github.io/mice-namibia`, branch `master`) is now a set of redirect
stubs: every page has a meta refresh and a canonical link to its address on
the live site (the same map as the `redirects` table), and `404.html` sends
visitors to the homepage. The same `.html` paths also answer with a 301 on
the live site itself.

## Troubleshooting

**`node -v` says v10, or npm fails with syntax errors.** The Node 22 PATH
line at the top of this guide was not run in this session.

**Where the logs are.** The app writes one JSON line per request or event to
stdout and stderr, which Passenger hands to the web server. On this
LiteSpeed host, look in cPanel > **Metrics** > **Errors** first; if the app's
lines are not there, ask Namhost support where Passenger application output
is written for the account. `~/mice-data/backups/backup.log` has the backups.
`npm run doctor` repeats most start-up problems in plain English, so run it
first.

**`/healthz` returns 503.** The body says which part:

- `"db":"down"`: wrong `DB_*` values in `.env`, the user not added to the
  database, or MariaDB itself down. `npm run doctor` shows the driver's
  message.
- `"migrations":"pending"`: the code is newer than the tables. Run `npm run
  migrate`, then `touch tmp/restart.txt`.
- A 503 that is not JSON comes from the web server: the app is not running.
  Check it is **Enabled** in Application Manager, run `npm run doctor`, then
  `touch tmp/restart.txt`.

**Upload errors (`EACCES`, `EPERM`, "permission denied").** `UPLOADS_DIR`
must be an absolute path that exists and belongs to `<cpuser>`:

```bash
ls -ld ~/mice-data/uploads        # owner <cpuser>, drwxr-xr-x
chmod 755 ~/mice-data/uploads
npm run doctor                    # "UPLOADS_DIR writable" must pass
```

**Admin login does not stick (back to the login page).** `BASE_URL` must be
`https://...`, `TRUST_PROXY=true`, and the site opened over https. The
doctor checks all three.

**The browser keeps asking for the staging password.** It is the
`STAGING_BASIC_AUTH` value in `.env`: the part before the colon is the
username, the part after it the password. Changing it needs `touch
tmp/restart.txt`.
