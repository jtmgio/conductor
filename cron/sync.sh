#!/bin/sh
# Hourly sync — runs both Linear and Granola
CONDUCTOR_URL="${CONDUCTOR_URL:-http://conductor:3000}"
SYNC_SECRET="${LINEAR_SYNC_SECRET:-conductor-linear-sync}"

echo "$(date): Starting hourly sync..."

# Linear sync
RESULT=$(curl -sf -X POST "$CONDUCTOR_URL/api/integrations/linear/sync" \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: $SYNC_SECRET" 2>&1) || true
echo "$(date): Linear sync — ${RESULT:-failed}"

# Granola sync
RESULT=$(curl -sf -X POST "$CONDUCTOR_URL/api/integrations/granola/sync" \
  -H "Content-Type: application/json" 2>&1) || true
echo "$(date): Granola sync — ${RESULT:-failed}"
