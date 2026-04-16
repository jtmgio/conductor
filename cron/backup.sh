#!/bin/bash
# Conductor DB backup — runs nightly via LaunchAgent
# Keeps last 7 days of backups

BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
CONTAINER="postgresql"
DB_NAME="conductor"
DB_USER="conductor"
DATE=$(date +%Y-%m-%d_%H%M)

mkdir -p "$BACKUP_DIR"

# Dump the database
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom \
  -f "/tmp/conductor-backup-${DATE}.dump" 2>/dev/null

# Copy from container to host
docker cp "$CONTAINER:/tmp/conductor-backup-${DATE}.dump" \
  "$BACKUP_DIR/conductor-${DATE}.dump" 2>/dev/null

# Clean up inside container
docker exec "$CONTAINER" rm -f "/tmp/conductor-backup-${DATE}.dump" 2>/dev/null

# Also do a plain SQL backup (easier to inspect/restore)
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  > "$BACKUP_DIR/conductor-${DATE}.sql" 2>/dev/null

# Delete backups older than 7 days
find "$BACKUP_DIR" -name "conductor-*.dump" -mtime +7 -delete 2>/dev/null
find "$BACKUP_DIR" -name "conductor-*.sql" -mtime +7 -delete 2>/dev/null

# Log result
if [ -f "$BACKUP_DIR/conductor-${DATE}.sql" ] && [ -s "$BACKUP_DIR/conductor-${DATE}.sql" ]; then
  echo "$(date): Backup OK — conductor-${DATE}.sql ($(du -h "$BACKUP_DIR/conductor-${DATE}.sql" | cut -f1))" \
    >> "$BACKUP_DIR/backup.log"
else
  echo "$(date): Backup FAILED" >> "$BACKUP_DIR/backup.log"
fi
