#!/bin/bash
# Calendar sync — reads events via EventKit and feeds them to Conductor
# Runs every 30 minutes via LaunchAgent; guards for working hours

CONDUCTOR_URL="${CONDUCTOR_URL:-http://localhost:5402}"
SYNC_TRIGGER="${SYNC_TRIGGER:-cron-refresh}"
TODAY=$(date +%Y-%m-%d)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Only run during working hours (7 AM - 4 PM, weekdays)
# Belt-and-suspenders with the LaunchAgent's StartCalendarInterval schedule.
HOUR=$(date +%H)
DAY=$(date +%u)  # 1=Mon, 7=Sun
if [ "$DAY" -gt 5 ] || [ "$HOUR" -lt 7 ] || [ "$HOUR" -gt 16 ]; then
  echo "$(date): Outside working hours, skipping"
  exit 0
fi

echo "$(date): Starting calendar sync for $TODAY..."

# Read events directly from macOS Calendar via EventKit (fast, accurate, no screenshot needed)
# Prefer the compiled binary (holds its own TCC Calendar grant — works under launchd).
# Falls back to the swift script if the binary hasn't been built yet.
if [ -x "$SCRIPT_DIR/calendar-events" ]; then
  EVENTS_JSON=$("$SCRIPT_DIR/calendar-events" "$TODAY" 2>&1)
else
  EVENTS_JSON=$(swift "$SCRIPT_DIR/calendar-events.swift" "$TODAY" 2>&1)
fi
SWIFT_STATUS=$?

if [ $SWIFT_STATUS -ne 0 ] || echo "$EVENTS_JSON" | grep -q '"error"'; then
  echo "$(date): ERROR — Failed to read calendar events: $EVENTS_JSON"
  exit 1
fi

EVENT_COUNT=$(echo "$EVENTS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('events',[])))" 2>/dev/null)
echo "$(date): Read $EVENT_COUNT events from Calendar"

# Extract events array from the Swift output
EVENTS_ARRAY=$(echo "$EVENTS_JSON" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('events',[])))" 2>/dev/null)

# Skip if events haven't changed (hash comparison)
# Use python3 (portable; LaunchAgent PATH excludes /sbin where macOS md5 lives)
HASH_FILE="/tmp/conductor-calendar-last-hash"
NEW_HASH=$(python3 -c "import sys,hashlib; print(hashlib.md5(sys.argv[1].encode()).hexdigest())" "$EVENTS_ARRAY")
if [ -f "$HASH_FILE" ] && [ "$(cat "$HASH_FILE")" = "$NEW_HASH" ]; then
  echo "$(date): Calendar unchanged (hash match), skipping API call"
  exit 0
fi

# Build JSON payload
PAYLOAD="/tmp/conductor-calendar-payload.json"
python3 -c "
import json, sys
events = json.loads(sys.argv[1])
payload = {'events': events, 'date': sys.argv[2], 'trigger': sys.argv[3]}
with open(sys.argv[4], 'w') as f:
    json.dump(payload, f)
" "$EVENTS_ARRAY" "$TODAY" "$SYNC_TRIGGER" "$PAYLOAD"

# POST to Conductor calendar API
RESULT=$(curl -sS --fail-with-body -X POST "$CONDUCTOR_URL/api/calendar/process" \
  -H "Content-Type: application/json" \
  -d @"$PAYLOAD" \
  --max-time 120 2>&1)

STATUS=$?
if [ $STATUS -eq 0 ]; then
  echo "$(date): Calendar sync success — $RESULT"
  echo "$NEW_HASH" > "$HASH_FILE"
else
  echo "$(date): Calendar sync failed (exit $STATUS) — $RESULT"
fi

# Clean up
rm -f "$PAYLOAD"
