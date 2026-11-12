#!/usr/bin/env bash
# Daily backup of the database and the uploaded images (cPanel cron job).
#
#   bash scripts/backup.sh            (or: npm run backup)
#
# Writes to BACKUP_DIR (from .env, default ../backups next to the app root):
#   db-<UTC stamp>.sql.gz         mysqldump --single-transaction of DB_NAME
#   uploads-<UTC stamp>.tar.gz    everything in UPLOADS_DIR
#   backup.log                    one line per step, appended every run
# Files older than 14 days are removed. Quiet on success; on failure the
# reason goes to stderr as well, so cron mails it to the account owner.
#
# The database password is read from .env and handed to mysqldump in a
# temporary option file (mode 600, deleted on exit), never on the command
# line, so it does not show up in `ps` output.
#
# Restore steps: DEPLOY.md, "Restore a backup".

set -Eeuo pipefail
umask 077

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_ROOT/.env}"
KEEP_DAYS="${KEEP_DAYS:-14}"

die() {
  local msg="backup failed: $*"
  if [[ -n "${LOG_FILE:-}" ]]; then printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$msg" >>"$LOG_FILE"; fi
  printf '%s\n' "$msg" >&2
  exit 1
}

log() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  printf '%s\n' "$line" >>"$LOG_FILE"
  if [[ -t 1 ]]; then printf '%s\n' "$line"; fi
}

# Reads KEY from .env the way dotenv does for single-line values: optional
# surrounding quotes; unquoted values lose a trailing " # comment".
env_get() {
  local key="$1" default="${2:-}" line value
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    printf '%s' "$default"
    return
  fi
  value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  if [[ "$value" == \"* ]]; then
    value="${value#\"}"
    value="${value%%\"*}"
  elif [[ "$value" == \'* ]]; then
    value="${value#\'}"
    value="${value%%\'*}"
  else
    value="${value%%[[:space:]]#*}"
    value="${value%"${value##*[![:space:]]}"}"
  fi
  value="${value%$'\r'}"
  if [[ -z "$value" ]]; then value="$default"; fi
  printf '%s' "$value"
}

size_of() {
  local bytes
  bytes="$(wc -c <"$1" | tr -d ' ')"
  numfmt --to=iec --suffix=B "$bytes" 2>/dev/null || printf '%s bytes' "$bytes"
}

abs_path() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s' "$APP_ROOT/$1" ;;
  esac
}

[[ -f "$ENV_FILE" ]] || { printf 'backup failed: %s not found\n' "$ENV_FILE" >&2; exit 1; }

BACKUP_DIR="$(abs_path "$(env_get BACKUP_DIR ../backups)")"
UPLOADS_DIR="$(abs_path "$(env_get UPLOADS_DIR storage/uploads)")"
DB_HOST="$(env_get DB_HOST 127.0.0.1)"
DB_PORT="$(env_get DB_PORT 3306)"
DB_NAME="$(env_get DB_NAME)"
DB_USER="$(env_get DB_USER)"
DB_PASSWORD="$(env_get DB_PASSWORD)"

mkdir -p "$BACKUP_DIR" || { printf 'backup failed: cannot create %s\n' "$BACKUP_DIR" >&2; exit 1; }
LOG_FILE="${LOG_FILE:-$BACKUP_DIR/backup.log}"
touch "$LOG_FILE" || { printf 'backup failed: cannot write %s\n' "$LOG_FILE" >&2; exit 1; }

[[ -n "$DB_NAME" && -n "$DB_USER" ]] || die "DB_NAME and DB_USER must be set in $ENV_FILE"
case "$DB_PASSWORD" in
  *$'\n'* | *\"*) die "DB_PASSWORD contains a double quote or newline, which the option file cannot hold; change the database password" ;;
esac

DUMP="${MYSQLDUMP:-$(command -v mariadb-dump || command -v mysqldump || true)}"
[[ -n "$DUMP" ]] || die "neither mariadb-dump nor mysqldump is on the PATH"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
DB_FILE="$BACKUP_DIR/db-$STAMP.sql.gz"
UP_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"

CNF="$(mktemp "${TMPDIR:-/tmp}/mice-backup.XXXXXX")"
cleanup() {
  rm -f "$CNF" "$DB_FILE.part" "$UP_FILE.part"
}
trap cleanup EXIT
trap 'die "line $LINENO: $BASH_COMMAND"' ERR
chmod 600 "$CNF"

# Option-file values: backslashes must be doubled inside double quotes.
esc_pw="${DB_PASSWORD//\\/\\\\}"
cat >"$CNF" <<EOF
[client]
host="$DB_HOST"
port=$DB_PORT
user="$DB_USER"
password="$esc_pw"
EOF

log "start: database $DB_NAME, uploads $UPLOADS_DIR -> $BACKUP_DIR"

# --single-transaction: a consistent snapshot of InnoDB tables without
# locking the live site. --no-tablespaces: cPanel database users lack the
# PROCESS privilege that tablespace dumping needs.
"$DUMP" --defaults-extra-file="$CNF" \
  --single-transaction --quick --skip-lock-tables --no-tablespaces \
  --default-character-set=utf8mb4 --hex-blob \
  "$DB_NAME" 2>>"$LOG_FILE" | gzip -9 >"$DB_FILE.part"
gzip -t "$DB_FILE.part"
mv "$DB_FILE.part" "$DB_FILE"
log "database: $(basename "$DB_FILE") ($(size_of "$DB_FILE"))"

if [[ -d "$UPLOADS_DIR" ]]; then
  tar -czf "$UP_FILE.part" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")" 2>>"$LOG_FILE"
  mv "$UP_FILE.part" "$UP_FILE"
  log "uploads: $(basename "$UP_FILE") ($(size_of "$UP_FILE"))"
else
  die "UPLOADS_DIR $UPLOADS_DIR does not exist"
fi

# Keep the last KEEP_DAYS days. Only our own file names are ever matched.
removed="$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime "+$((KEEP_DAYS - 1))" -print -delete | wc -l)"
log "done: removed $removed backup file(s) older than $KEEP_DAYS days"
