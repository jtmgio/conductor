#!/bin/bash
# Fires at 4:45pm Mon-Fri via LaunchAgent. Brings Conductor to the foreground
# so the in-app prompt (EodPlanningPrompt) can present the planning modal.
# The actual gating logic — Mon-Fri, lastPlannedFor, snooze, skip-today —
# lives in the React component; this script is just an attention-getter.

CONDUCTOR_URL="${CONDUCTOR_URL:-http://localhost:5402}"

# Open the URL — if a tab already exists at this origin, Chrome focuses it;
# otherwise a new tab opens.
/usr/bin/open "$CONDUCTOR_URL"

# Native macOS notification — clicking it brings the app forward too.
/usr/bin/osascript -e "display notification \"Plan tomorrow now so your evening is yours.\" with title \"Conductor — End of Day\" sound name \"Submarine\""

echo "[$(date)] EOD planning trigger fired"
