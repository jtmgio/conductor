#!/bin/bash
# Calendar sync — reads a rolling window of days via EventKit and feeds each to Conductor.
# Runs every 10 minutes via LaunchAgent; guards for working hours.
#
# Historically this synced only today. It now syncs today + the next CALENDAR_WINDOW_DAYS-1
# days so future meetings are queryable (e.g. via the get_meetings MCP tool). Each day is
# hashed independently — unchanged days are skipped, so the extra window is cheap after the
# first pass (most future days rarely change between runs).

CONDUCTOR_URL="${CONDUCTOR_URL:-http://localhost:5402}"
SYNC_TRIGGER="${SYNC_TRIGGER:-cron-refresh}"
WINDOW_DAYS="${CALENDAR_WINDOW_DAYS:-14}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Runs around the clock, deliberately. The old 7AM-4PM weekday guard meant an
# early start (or a meeting moved overnight) saw a stale window until the 7am
# run. Per-day hashing makes off-hours runs nearly free: unchanged days skip the
# API call entirely, so a quiet night costs one EventKit read per day and no
# writes. Set CALENDAR_WORK_HOURS_ONLY=1 to restore the old behavior.
if [ "${CALENDAR_WORK_HOURS_ONLY:-0}" = "1" ]; then
  HOUR=$(date +%H)
  DAY=$(date +%u)  # 1=Mon, 7=Sun
  if [ "$DAY" -gt 5 ] || [ "$HOUR" -lt 7 ] || [ "$HOUR" -gt 16 ]; then
    echo "$(date): Outside working hours, skipping"
    exit 0
  fi
fi

# Read one day's events from EventKit. Echoes the events JSON array on success, or one of
# the sentinels TIMEOUT / ERROR (and returns non-zero) on failure.
# Prefer the compiled binary (holds its own TCC Calendar grant — works under launchd);
# fall back to the swift script if it hasn't been built. 90s watchdog: a rebuilt binary
# loses its TCC grant and the invisible permission prompt hangs forever under launchd.
read_day() {
  local d="$1" json status
  if [ -x "$SCRIPT_DIR/calendar-events" ]; then
    json=$(perl -e 'alarm shift; exec @ARGV' 90 "$SCRIPT_DIR/calendar-events" "$d" 2>&1)
  else
    json=$(perl -e 'alarm shift; exec @ARGV' 90 swift "$SCRIPT_DIR/calendar-events.swift" "$d" 2>&1)
  fi
  status=$?
  if [ $status -eq 142 ]; then echo "TIMEOUT"; return 1; fi
  if [ $status -ne 0 ] || echo "$json" | grep -q '"error"'; then echo "ERROR"; return 1; fi
  echo "$json" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('events',[])))" 2>/dev/null
}

# Sync one day: read, hash-compare, POST if changed, cache the hash on success.
sync_day() {
  local d="$1" events hash_file new_hash payload result status ai_ok count
  events=$(read_day "$d")
  if [ "$events" = "TIMEOUT" ]; then
    echo "$(date): $d — EventKit read timed out (lost TCC grant? rebuild + re-grant: bash $SCRIPT_DIR/build-calendar-events.sh && $SCRIPT_DIR/calendar-events)"
    return 1
  fi
  if [ "$events" = "ERROR" ] || [ -z "$events" ]; then
    echo "$(date): $d — read failed, skipping"
    return 1
  fi

  count=$(echo "$events" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)

  # Skip if this day's events haven't changed. Per-day hash file; date is part of the hash.
  hash_file="/tmp/conductor-calendar-hash-$d"
  new_hash=$(python3 -c "import sys,hashlib; print(hashlib.md5((sys.argv[1]+'|'+sys.argv[2]).encode()).hexdigest())" "$events" "$d")
  if [ -f "$hash_file" ] && [ "$(cat "$hash_file")" = "$new_hash" ]; then
    return 0  # unchanged — quiet
  fi

  payload="/tmp/conductor-calendar-payload-$d.json"
  python3 -c "
import json, sys
json.dump({'events': json.loads(sys.argv[1]), 'date': sys.argv[2], 'trigger': sys.argv[3]}, open(sys.argv[4], 'w'))
" "$events" "$d" "$SYNC_TRIGGER" "$payload"

  result=$(curl -sS --fail-with-body -X POST "$CONDUCTOR_URL/api/calendar/process" \
    -H "Content-Type: application/json" -d @"$payload" --max-time 120 2>&1)
  status=$?
  rm -f "$payload"

  if [ $status -ne 0 ]; then
    echo "$(date): $d sync failed (exit $status) — $result"
    return 1
  fi
  echo "$(date): $d synced ($count events) — $result"
  # Only cache the hash if the prep-task AI actually ran ("summary" present) or there was
  # nothing to prep. A degraded sync (Anthropic credits exhausted) must not be cached, or
  # prep tasks would never retry until the calendar changes.
  ai_ok=$(echo "$result" | python3 -c "
import sys, json
r = json.load(sys.stdin)
prepable = r.get('meetingsFound', 0) - r.get('meetingsIgnored', 0)
print('yes' if ('summary' in r or prepable <= 0) else 'no')
" 2>/dev/null)
  if [ "$ai_ok" = "no" ]; then
    echo "$(date): $d — prep-task AI did not run (check Anthropic credits/key). Hash not cached; next run retries."
  else
    echo "$new_hash" > "$hash_file"
  fi
}

echo "$(date): Starting calendar sync — ${WINDOW_DAYS}-day window from $(date +%Y-%m-%d)..."
for D in $(seq 0 $((WINDOW_DAYS - 1))); do
  TARGET=$(date -v+"${D}"d +%Y-%m-%d)  # BSD/macOS date arithmetic
  sync_day "$TARGET"
done
echo "$(date): Calendar sync window complete"
