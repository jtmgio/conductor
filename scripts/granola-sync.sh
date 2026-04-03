#!/bin/bash
# Granola → Conductor sync — runs every 30 minutes
CONDUCTOR_URL="${CONDUCTOR_URL:-http://localhost:3000}"

RESULT=$(curl -s -X POST "$CONDUCTOR_URL/api/integrations/granola/sync" \
  -H "Content-Type: application/json")

echo "$(date): Granola sync — $RESULT" >> "$(dirname "$0")/granola-sync.log"
