#!/bin/bash
# Conductor DB backup — runs nightly via LaunchAgent
# Keeps last 7 days of backups

BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
CONTAINER="${POSTGRES_CONTAINER:-postgres}"
DB_NAME="conductor"
DB_USER="${POSTGRES_USER:-postgres}"
DATE=$(date +%Y-%m-%d_%H%M)

mkdir -p "$BACKUP_DIR"

LOG="$BACKUP_DIR/backup.log"
ERR_LOG="$BACKUP_DIR/backup.err"
: > "$ERR_LOG"

# Resolve docker explicitly. launchd runs this script with a minimal PATH that
# does NOT include Docker.app's bin dir, so a bare `docker` fails "command not
# found" — which previously produced SILENT 0-byte backups. Pick the first docker
# that exists, and fail loudly if none is found.
DOCKER=""
for d in /usr/local/bin/docker /opt/homebrew/bin/docker \
         /Applications/Docker.app/Contents/Resources/bin/docker \
         "$(command -v docker 2>/dev/null)"; do
  [ -n "$d" ] && [ -x "$d" ] && { DOCKER="$d"; break; }
done
if [ -z "$DOCKER" ]; then
  echo "$(date): Backup FAILED — docker not found (launchd PATH lacks it)" >> "$LOG"
  exit 1
fi

# Dump the database (custom format)
"$DOCKER" exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom \
  -f "/tmp/conductor-backup-${DATE}.dump" 2>>"$ERR_LOG"

# Copy from container to host
"$DOCKER" cp "$CONTAINER:/tmp/conductor-backup-${DATE}.dump" \
  "$BACKUP_DIR/conductor-${DATE}.dump" 2>>"$ERR_LOG"

# Clean up inside container
"$DOCKER" exec "$CONTAINER" rm -f "/tmp/conductor-backup-${DATE}.dump" 2>>"$ERR_LOG"

# Also do a plain SQL backup (easier to inspect/restore)
"$DOCKER" exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  > "$BACKUP_DIR/conductor-${DATE}.sql" 2>>"$ERR_LOG"

# Delete backups older than 7 days
find "$BACKUP_DIR" -name "conductor-*.dump" -mtime +7 -delete 2>/dev/null
find "$BACKUP_DIR" -name "conductor-*.sql" -mtime +7 -delete 2>/dev/null

# Log result
if [ -f "$BACKUP_DIR/conductor-${DATE}.sql" ] && [ -s "$BACKUP_DIR/conductor-${DATE}.sql" ]; then
  echo "$(date): Backup OK — conductor-${DATE}.sql ($(du -h "$BACKUP_DIR/conductor-${DATE}.sql" | cut -f1))" >> "$LOG"
else
  echo "$(date): Backup FAILED — see backup.err" >> "$LOG"
  exit 1
fi
