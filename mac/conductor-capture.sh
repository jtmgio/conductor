#!/bin/bash
# Quick capture — POSTs one line of text to Conductor's /api/capture, which runs the
# local MLX refine (short title, notes, checklist, due date) and infers the company.
#
# Called detached by Conductor Capture.app (see build-capture-app.sh) so the input
# dialog can close instantly — a cold MLX refine takes up to ~30s and a frozen modal
# reads as a hung app. The confirmation arrives when the task actually lands.
#
#   bash mac/conductor-capture.sh "reply to dana about the sailthru scores by friday"

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Where Conductor lives. Spotlight-launched apps inherit no shell profile, so a laptop
# install can't rely on an exported env var — it reads ~/.conductor/url instead.
# Order: CONDUCTOR_URL env > ~/.conductor/url > localhost (the tower itself).
if [ -n "${CONDUCTOR_URL:-}" ]; then
  :
elif [ -f "$HOME/.conductor/url" ]; then
  CONDUCTOR_URL="$(tr -d '[:space:]' < "$HOME/.conductor/url")"
else
  CONDUCTOR_URL="http://localhost:5402"
fi
# In the repo (the tower) log alongside the other sync logs; on a client machine where
# these scripts were copied out of the repo, keep it in ~/.conductor instead.
if [ -f "$REPO_DIR/.env" ]; then
  LOG_FILE="$REPO_DIR/logs/capture.log"
else
  LOG_FILE="$HOME/.conductor/capture.log"
fi

TEXT="${1:-}"

log() { mkdir -p "$(dirname "$LOG_FILE")"; echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"; }

# Auto-dismissing alert — no click required, and unlike `display notification` it needs
# no notification permission (this is launched from an unsigned local bundle).
alert() {
  local title="$1" message="$2"
  osascript -e 'on run {t, m}' \
            -e 'display alert t message m giving up after 4' \
            -e 'end run' \
            "$title" "$message" > /dev/null 2>&1
}

if [ -z "$TEXT" ]; then
  log "ERROR empty text"
  exit 1
fi

# Token: explicit override file first, else the repo .env (single source of truth).
TOKEN=""
if [ -f "$HOME/.conductor/capture-token" ]; then
  TOKEN="$(tr -d '[:space:]' < "$HOME/.conductor/capture-token")"
elif [ -f "$REPO_DIR/.env" ]; then
  TOKEN="$(grep -m1 '^MCP_API_TOKEN=' "$REPO_DIR/.env" | cut -d= -f2- | tr -d '\r\n' | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
fi

if [ -z "$TOKEN" ]; then
  log "ERROR no token (checked ~/.conductor/capture-token and $REPO_DIR/.env)"
  alert "Capture failed" "No MCP_API_TOKEN found."
  exit 1
fi

# Build the JSON body in Python so quotes/newlines in the text can't break it
BODY="$(TEXT="$TEXT" python3 -c 'import json,os; print(json.dumps({"text": os.environ["TEXT"]}))')"

RESPONSE="$(curl -sS --max-time 120 -w '\n%{http_code}' \
  -X POST "$CONDUCTOR_URL/api/capture" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY" 2>&1)"
CURL_EXIT=$?

STATUS="$(echo "$RESPONSE" | tail -n1)"
PAYLOAD="$(echo "$RESPONSE" | sed '$d')"

if [ $CURL_EXIT -ne 0 ]; then
  log "ERROR curl exit $CURL_EXIT — $PAYLOAD"
  alert "Capture failed" "Can't reach Conductor at $CONDUCTOR_URL. Is the container up?"
  exit 1
fi

if [ "$STATUS" != "200" ]; then
  log "ERROR http $STATUS — $PAYLOAD"
  case "$STATUS" in
    401) alert "Capture failed" "Unauthorized — the capture token is wrong." ;;
    *)   alert "Capture failed" "Conductor returned HTTP $STATUS." ;;
  esac
  exit 1
fi

SUMMARY="$(PAYLOAD="$PAYLOAD" python3 -c '
import json, os
try:
    d = json.loads(os.environ["PAYLOAD"])
    print(d.get("title") or "Task")
    print(d.get("company") or "Conductor")
except Exception:
    print("Task")
    print("Conductor")
')"
TITLE="$(echo "$SUMMARY" | head -n1)"
COMPANY="$(echo "$SUMMARY" | tail -n1)"

log "OK [$COMPANY] $TITLE  (raw: $TEXT)"
alert "Added to $COMPANY" "$TITLE"
