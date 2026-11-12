# Deploying to cPanel (staging)

How the staging site at **https://staging.zusammentravels.com** was set up
(12 Nov 2026) on the client's Namhost cPanel account, and how to update it.
The host runs LiteSpeed with cPanel's **Application Manager** (Phusion
Passenger) for Node apps, Node 22 from cPanel's `ea-nodejs22` package and
MariaDB 10.11. There is no "Setup Node.js App" (CloudLinux) on this account.

Production will be the same with `SITE_ENV=production`, its own database and
no `STAGING_BASIC_AUTH`.

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

# The corporate.events@zusammentravels.com mailbox (cPanel > Email Accounts >
# Connect Devices shows the outgoing server and port). Empty = enquiries are
# saved in the admin but not emailed.
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
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

`npm run test-email` sends one test message to `MAIL_TO` once SMTP is set.

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
