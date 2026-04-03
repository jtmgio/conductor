#!/bin/bash
# Linear → Conductor hourly sync
CONDUCTOR_URL="${CONDUCTOR_URL:-http://localhost:3000}"
SYNC_SECRET="${LINEAR_SYNC_SECRET:-conductor-linear-sync}"

RESULT=$(curl -s -X POST "$CONDUCTOR_URL/api/integrations/linear/sync" \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: $SYNC_SECRET")

echo "$(date): Linear sync — $RESULT" >> "$(dirname "$0")/linear-sync.log"
