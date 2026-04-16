#!/bin/bash
# Compile calendar-events.swift into a signed binary with embedded Info.plist
# so it can hold its own TCC Calendar permission (independent of the calling shell).
#
# Run this once per machine. The first time you execute the resulting binary,
# macOS will prompt for Calendar access — grant it. After that, the LaunchAgent
# will work because the binary itself owns the TCC grant.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/calendar-events.swift"
PLIST="$SCRIPT_DIR/calendar-events-Info.plist"
OUTPUT="$SCRIPT_DIR/calendar-events"

if [ ! -f "$SOURCE" ]; then
  echo "ERROR: $SOURCE not found"
  exit 1
fi
if [ ! -f "$PLIST" ]; then
  echo "ERROR: $PLIST not found"
  exit 1
fi

echo "Compiling $SOURCE → $OUTPUT ..."
swiftc \
  -O \
  -framework EventKit \
  -framework Foundation \
  -Xlinker -sectcreate \
  -Xlinker __TEXT \
  -Xlinker __info_plist \
  -Xlinker "$PLIST" \
  -o "$OUTPUT" \
  "$SOURCE"

echo "Code-signing (ad-hoc) ..."
codesign --force --sign - "$OUTPUT"

echo "Done. Binary: $OUTPUT"
echo ""
echo "Next step: run it once to trigger the macOS Calendar permission prompt:"
echo "  $OUTPUT"
echo ""
echo "Grant access in the dialog. Then verify it works:"
echo "  bash $SCRIPT_DIR/calendar-sync.sh"
