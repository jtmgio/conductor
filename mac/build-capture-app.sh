#!/bin/bash
# Compile ConductorCapture.applescript into /Applications/Conductor Capture.app so
# Spotlight indexes it. Run once per machine (and again after editing the .applescript).
#
# The app is named "Conductor Capture" so ⌘Space → "conductor" matches it. Spotlight
# ranking is usage-weighted, so it may take a couple of launches to become the default
# Enter target.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/ConductorCapture.applescript"
HELPER="$SCRIPT_DIR/conductor-capture.sh"
APP_PATH="${APP_PATH:-/Applications/Conductor Capture.app}"

if [ ! -f "$SOURCE" ]; then
  echo "ERROR: $SOURCE not found"
  exit 1
fi
if [ ! -f "$HELPER" ]; then
  echo "ERROR: $HELPER not found"
  exit 1
fi

chmod +x "$HELPER"

# Bake the absolute helper path into a temp copy of the source
TMP_SRC="$(mktemp -t ConductorCapture).applescript"
trap 'rm -f "$TMP_SRC"' EXIT
sed "s|__HELPER_PATH__|$HELPER|" "$SOURCE" > "$TMP_SRC"

echo "Compiling $SOURCE → $APP_PATH ..."
rm -rf "$APP_PATH"
osacompile -o "$APP_PATH" "$TMP_SRC"

echo "Done. App: $APP_PATH"
echo "      Helper: $HELPER"
echo ""
echo "Test the helper directly:"
echo "  bash \"$HELPER\" \"test capture — delete me\""
echo ""
echo "Then: ⌘Space → type 'conductor' → Enter"
