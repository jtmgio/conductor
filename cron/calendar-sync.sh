#!/bin/bash
# Calendar sync — takes a screenshot of macOS Calendar and feeds it to Conductor
# Runs daily at 5:00 AM via LaunchAgent (weekdays only)

CONDUCTOR_URL="${CONDUCTOR_URL:-http://localhost:3000}"
SYNC_TRIGGER="${SYNC_TRIGGER:-cron}"
TODAY=$(date +%Y-%m-%d)
SCREENSHOT="/tmp/conductor-calendar-$TODAY.png"

echo "$(date): Starting calendar sync for $TODAY..."

# Open Calendar app to today's day view
open -a "Calendar"
sleep 3

# Bring Calendar to front
osascript -e 'tell application "Calendar" to activate' 2>/dev/null
sleep 2

# Get Calendar window ID via CoreGraphics (no accessibility permissions needed)
WINDOW_ID=$(swift -e '
import CoreGraphics
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windows {
    if let name = w["kCGWindowOwnerName"] as? String, name == "Calendar" {
        if let num = w["kCGWindowNumber"] as? Int { print(num); break }
    }
}
' 2>/dev/null)

if [ -n "$WINDOW_ID" ]; then
  screencapture -l "$WINDOW_ID" -o "$SCREENSHOT" 2>/dev/null
fi

# Fallback: full screen capture if window ID approach failed
if [ ! -f "$SCREENSHOT" ] || [ ! -s "$SCREENSHOT" ]; then
  echo "$(date): Window capture failed, falling back to full screen"
  screencapture -o "$SCREENSHOT" 2>/dev/null
fi

if [ ! -f "$SCREENSHOT" ] || [ ! -s "$SCREENSHOT" ]; then
  echo "$(date): ERROR — Failed to capture Calendar screenshot"
  exit 1
fi

echo "$(date): Screenshot saved to $SCREENSHOT ($(du -h "$SCREENSHOT" | cut -f1))"

# Base64-encode the screenshot
IMAGE_B64=$(base64 -i "$SCREENSHOT" | tr -d '\n')

# POST to Conductor calendar API
RESULT=$(curl -sf -X POST "$CONDUCTOR_URL/api/calendar/process" \
  -H "Content-Type: application/json" \
  -d "{\"image\": \"$IMAGE_B64\", \"date\": \"$TODAY\", \"trigger\": \"$SYNC_TRIGGER\"}" \
  --max-time 60 2>&1)

STATUS=$?
if [ $STATUS -eq 0 ]; then
  echo "$(date): Calendar sync success — $RESULT"
else
  echo "$(date): Calendar sync failed (exit $STATUS) — $RESULT"
fi

# Clean up screenshot
rm -f "$SCREENSHOT"
