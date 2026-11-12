# Deploying to cPanel (staging)

Step by step for a cPanel host with "Setup Node.js App" (CloudLinux Node.js
Selector, run by Passenger), Node 22 and MariaDB. Written for the staging
site; production is the same with `SITE_ENV=production` and no
`STAGING_BASIC_AUTH`.

Placeholders used below:

| Placeholder | Meaning |
| --- | --- |
| `<cpuser>` | The cPanel account's username (home folder `/home/<cpuser>`) |
| `<domain>` | The main domain on the account |
| `staging.<domain>` | The staging address |
| `~/mice-staging` | App root: the git checkout, outside `public_html` |
| `~/mice-data/uploads` | Uploaded images, outside the app root |
| `~/mice-data/backups` | Daily backups, outside the app root |

Keeping uploads and backups outside the app root means a redeploy (or
deleting and re-cloning the checkout) never touches them.

## 1. Subdomain and HTTPS

1. cPanel > **Domains** (or **Subdomains** on older versions) > Create:
   `staging.<domain>`. Let cPanel pick the document root (for example
   `/home/<cpuser>/staging.<domain>`). Passenger writes its `.htaccess`
   there; nothing else goes in that folder, and it is not the app root.
2. cPanel > **SSL/TLS Status**: tick `staging.<domain>` and click **Run
   AutoSSL**. Wait until it shows a valid certificate before going on, since
   the app only sets secure cookies and a login over plain HTTP will not
   stick.

## 2. Database and user

cPanel > **MySQL Databases** (the same screen manages MariaDB):

1. Create a database, for example `<cpuser>_mice_staging` (cPanel adds the
   `<cpuser>_` prefix).
2. Create a user, for example `<cpuser>_mice`, with a generated password.
3. **Add User To Database** > **ALL PRIVILEGES**.

Then set its character set (cPanel > **phpMyAdmin** > select the database >
**Operations** > Collation `utf8mb4_unicode_ci`, or in the SQL tab):

```sql
ALTER DATABASE <cpuser>_mice_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 3. Get the code onto the server

The repository is private, so the server needs its own **read-only deploy
key**. Never copy your personal SSH key to the server.

1. Open cPanel > **Terminal** (or SSH in) and make a key with no passphrase:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/mice_deploy -N "" -C "mice staging deploy key"
   cat ~/.ssh/mice_deploy.pub
   ```

2. GitHub > the repository > **Settings** > **Deploy keys** > **Add deploy
   key**: paste the public key, leave **Allow write access** unticked.
3. Tell SSH to use that key for GitHub:

   ```bash
   cat >> ~/.ssh/config <<'EOF'
   Host github.com
     IdentityFile ~/.ssh/mice_deploy
     IdentitiesOnly yes
   EOF
   chmod 600 ~/.ssh/config
   ssh -T git@github.com   # answer "yes"; it should greet the repository
   ```

4. Clone the backend branch as the app root:

   ```bash
   git clone --branch phase-2-backend git@github.com:tsegale/mice-namibia.git ~/mice-staging
   ```

   cPanel > **Git Version Control** > **Create** with the same clone URL and
   `/home/<cpuser>/mice-staging` as the repository path does the same thing
   from the browser (it uses the same SSH key). Either way, clone **before**
   creating the Node.js app in step 4, so the folder holds the code and not
   cPanel's sample app.

5. Make the data folders:

   ```bash
   mkdir -p ~/mice-data/uploads ~/mice-data/backups
   chmod 755 ~/mice-data/uploads
   chmod 700 ~/mice-data/backups
   ```

`.env` is never uploaded or committed. It is created on the server in step
6 and git ignores it, so pulls never overwrite it.

## 4. Create the Node.js app

cPanel > **Setup Node.js App** > **Create Application**:

| Field | Value |
| --- | --- |
| Node.js version | The newest 22.x in the list |
| Application mode | Production |
| Application root | `mice-staging` (that is, `/home/<cpuser>/mice-staging`, outside `public_html`) |
| Application URL | `staging.<domain>`, path left empty |
| Application startup file | `app.js` |
| Passenger log file | `/home/<cpuser>/logs/mice-staging.log` (if the field is shown) |

Leave the environment variables section empty: all settings live in `.env`
(one place to check). Click **Create**, then **Stop App** until step 7 is
done.

At the top of the app's page cPanel shows a command like:

```bash
source /home/<cpuser>/nodevenv/mice-staging/22/bin/activate && cd /home/<cpuser>/mice-staging
```

Every `npm` command below runs in a terminal after that command, so it uses
the app's Node 22 and its `node_modules`.

## 5. Install

```bash
npm ci --omit=dev
```

This installs exactly what `package-lock.json` lists, without the
development tools (ESLint, the test runner, pino-pretty). The app writes
plain JSON log lines in production and never needs pino-pretty.

The Node.js Selector keeps `node_modules` inside the virtual environment and
links it into the app root. If it ever complains that the app root holds a
real `node_modules` folder, delete that folder and run the command again
from the activated environment (or use the **Run NPM Install** button once).

## 6. The staging `.env`

Create `~/mice-staging/.env` on the server (Terminal: `nano .env`, or File
Manager > New File) and lock it down with `chmod 600 .env`. Fill in:

```ini
NODE_ENV=production
SITE_ENV=staging
TRUST_PROXY=true
BASE_URL=https://staging.<domain>

DB_HOST=localhost
DB_PORT=3306
DB_NAME=<cpuser>_mice_staging
DB_USER=<cpuser>_mice
DB_PASSWORD=<the password from step 2>

# New for this server, never reused from a laptop. Make it with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=<64 hex characters>

# Absolute paths outside the app root, so redeploys never touch them.
UPLOADS_DIR=/home/<cpuser>/mice-data/uploads
BACKUP_DIR=/home/<cpuser>/mice-data/backups
UPLOAD_MAX_MB=12

# The corporate.events@zusammentravels.com mailbox (cPanel > Email Accounts >
# Connect Devices shows the outgoing server and port).
SMTP_HOST=<outgoing mail server>
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=corporate.events@zusammentravels.com
SMTP_PASS=<mailbox password>
MAIL_FROM=corporate.events@zusammentravels.com
MAIL_TO=corporate.events@zusammentravels.com

# Browser password for the whole staging site while Macedo tests it.
STAGING_BASIC_AUTH=<user>:<long random password>

LOG_LEVEL=info
```

Notes:

- `SITE_ENV=staging` makes `robots.txt` say `Disallow: /` and adds a
  `noindex` header to every response. `npm run doctor` checks the two agree.
- `STAGING_BASIC_AUTH` covers everything except `/healthz`, so the uptime
  monitor works without the password.
- A database password with a double quote in it cannot be used by the
  backup script; pick one without (cPanel's generator rarely uses them).

## 7. First run

From the activated environment in `~/mice-staging`:

```bash
npm run migrate                          # build the tables
npm run seed -- --allow-production       # starter content, once
npm run create-admin -- --email you@example.com --name "Your Name"
npm run doctor                           # must end with 0 failed
mkdir -p tmp && touch tmp/restart.txt    # restart under Passenger
```

Then **Start App** in Setup Node.js App (later restarts only need the
`touch`). Check:

```bash
curl -s https://staging.<domain>/healthz
# {"status":"ok","db":"ok","migrations":"ok"}
```

and open `https://staging.<domain>/admin` in a browser. `npm run
test-email` sends one test message to `MAIL_TO`.

`npm run doctor` checks: settings load, database reachable, no pending
migrations, at least one active admin, `UPLOADS_DIR` writable, sharp can
make WebP, SMTP login (a warning if SMTP is not set up), and in production
that `BASE_URL` is https, `SESSION_SECRET` is not a placeholder and
`TRUST_PROXY` is on, and that `robots.txt` matches `SITE_ENV`. It exits 1 on
any failure, so it can gate a deploy.

## 8. Daily backup (cron)

cPanel > **Cron Jobs**. Set **Cron Email** to an address someone reads, then
add (02:15 server time, daily):

```
15 2 * * * /bin/bash /home/<cpuser>/mice-staging/scripts/backup.sh
```

The script is silent when it works, so cron only emails on failure. Each run
writes to `BACKUP_DIR`:

- `db-<UTC date-time>.sql.gz`: `mysqldump --single-transaction` of the
  database (a consistent snapshot, no locking of the live site)
- `uploads-<UTC date-time>.tar.gz`: the whole `UPLOADS_DIR`
- `backup.log`: one line per step, appended

Files older than 14 days are deleted. The database password goes to
mysqldump through a temporary option file (mode 600, removed afterwards), so
it never appears in the process list. Run it by hand once now
(`bash scripts/backup.sh`) and check `backup.log`.

The backups sit on the same server as the site. Download one now and then
(File Manager, or `scp`), or ask the host about off-server copies.

## 9. Uptime check

Any HTTP monitor (UptimeRobot, Better Stack, the host's own):

- URL: `https://staging.<domain>/healthz`
- Alert when the status is not 200, or the body does not contain
  `"status":"ok"`
- Every 5 minutes

The response says only `ok`, `down`, `pending` or `unknown` for the app,
the database and the migrations, with HTTP 503 when the database is down or
a migration has not been run. It shows no versions, hostnames or errors and
needs no password.

## 10. Deploying an update

Tag what you deploy, so there is always a known version to go back to. On
your machine: `git tag -a staging-2026-11-20 -m "..."` and push the tag.
Then on the server, from the activated environment in `~/mice-staging`:

```bash
git describe --tags --always      # write down the current version (for rollback)
bash scripts/backup.sh            # fresh backup in case a migration runs
git fetch --tags origin
git checkout staging-2026-11-20   # or: git pull --ff-only (latest phase-2-backend)
npm ci --omit=dev
npm run migrate
npm run doctor
touch tmp/restart.txt
curl -s https://staging.<domain>/healthz
```

CSS and JS links carry `?v=<commit>`, so visitors get the new styles right
after the restart even though static files are cached for a day.

If `npm run doctor` fails, fix what it names before the `touch`: until the
restart, Passenger keeps running the old code already in memory. (A
migration that already ran is not undone by that; see Rollback.)

## 11. Rollback

```bash
git checkout <the version you wrote down>
npm ci --omit=dev
```

If the update ran no migration, that is all: `npm run doctor`, then `touch
tmp/restart.txt`.

If it ran a migration, the old code does not match the new tables. Restore
the backup taken just before the update (next section), then `npm run
doctor` and `touch tmp/restart.txt`. Restoring loses anything saved on the
site since that backup (enquiries, edits), so export new enquiries from the
admin first if there are any.

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
compare `SELECT COUNT(*)` per table. This exact round trip (backup, restore
into a scratch database, row counts and uploads compared) was checked
against the docker-compose MariaDB 10.11.

## Troubleshooting

**Where the logs are.** The app writes one JSON line per request or event to
stdout, which Passenger captures:

- the **Passenger log file** set in Setup Node.js App (step 4), if your
  cPanel has that field;
- otherwise `stderr.log` in the app root, or cPanel > **Metrics** >
  **Errors** (the Apache error log), depending on the host;
- `~/mice-data/backups/backup.log` for backups.

Start-up failures (a bad `.env`, pending migrations, database refused) are
logged there with a plain-English reason, and Apache shows its own
"Web application could not be started" page.

**`/healthz` returns 503.** The body says which part:

- `"db":"down"`: wrong `DB_*` values in `.env`, the user not added to the
  database, or MariaDB itself down. `npm run doctor` shows the driver's
  message.
- `"migrations":"pending"`: the code is newer than the tables. Run `npm run
  migrate`, then `touch tmp/restart.txt`.
- A 503 that is not JSON comes from Apache/Passenger: the app is not running.
  Check the log above.

**Upload errors (`EACCES`, `EPERM`, "permission denied").** `UPLOADS_DIR`
must be an absolute path that exists and belongs to `<cpuser>`:

```bash
ls -ld ~/mice-data/uploads        # owner <cpuser>, drwxr-xr-x
chmod 755 ~/mice-data/uploads
npm run doctor                    # "UPLOADS_DIR writable" must pass
```

If `sharp encodes WebP` fails in the doctor, the server's system libraries
are too old for sharp's prebuilt binary (CloudLinux 7 and similar). Uploads
are still stored, without the resized WebP/JPG versions. Ask the host for a
CloudLinux 8 (or newer) server.

**Admin login does not stick (back to the login page).** `BASE_URL` must be
`https://...`, `TRUST_PROXY=true`, and the site opened over https. The
doctor checks all three.
