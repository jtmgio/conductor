#!/bin/bash
# Build /Applications/Conductor UI.app — the native SwiftUI interface.
#
# UI ONLY. No database, no API, no network, no webview. Every screen draws
# sample data from Models.swift so the layout and interaction can be judged
# before anything is wired up.
#
# Named "Conductor UI" on purpose: the Chrome web app is already called
# Conductor (~/Applications/Chrome Apps.localized/Conductor.app), so a bundle
# named plain "Conductor" loses `open -a Conductor` to it.
#
# Needs the Xcode command line tools: xcode-select --install

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/conductor-ui"
APP_NAME="${APP_NAME:-Conductor UI}"
BINARY="ConductorUI"
APP_PATH="${APP_PATH:-/Applications/$APP_NAME.app}"

if ! command -v swiftc > /dev/null 2>&1; then
  echo "ERROR: swiftc not found. Install the Xcode command line tools:"
  echo "  xcode-select --install"
  exit 1
fi

# Replace the binary under a running process and the next launch reopens the
# old one — the lesson Todo.app taught.
if pgrep -x "$BINARY" > /dev/null 2>&1; then
  echo "Quitting the running app ..."
  pkill -x "$BINARY" || true
  sleep 1
fi

echo "Building $APP_PATH ..."
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"

# -parse-as-library so @main is honoured across multiple files.
swiftc -O -parse-as-library \
  -o "$APP_PATH/Contents/MacOS/$BINARY" \
  "$SRC_DIR"/*.swift

cat > "$APP_PATH/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>io.jtmg.conductor.ui</string>
  <key>CFBundleExecutable</key><string>$BINARY</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

ICON_SRC="$REPO_DIR/public/icon-512.png"
if [ -f "$ICON_SRC" ] && command -v iconutil > /dev/null 2>&1; then
  ICONSET="$(mktemp -d)/AppIcon.iconset"
  mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z $size $size "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}.png" > /dev/null 2>&1
    sips -z $((size * 2)) $((size * 2)) "$ICON_SRC" --out "$ICONSET/icon_${size}x${size}@2x.png" > /dev/null 2>&1
  done
  iconutil -c icns "$ICONSET" -o "$APP_PATH/Contents/Resources/AppIcon.icns" 2>/dev/null \
    && echo "Icon embedded" || echo "Icon skipped"
  rm -rf "$(dirname "$ICONSET")"
fi

codesign --force --sign - "$APP_PATH" 2>/dev/null || true
mdimport "$APP_PATH" > /dev/null 2>&1 || true

echo ""
echo "Done: $APP_PATH"
echo ""
echo "  open '$APP_PATH'"
echo ""
echo "  ⌘1 Today · ⌘2 Board · ⌘3 Formatter · ⌘4 Meetings · ⌘, Settings · ⌃⌘S sidebar"
echo "  Sample data only — nothing here talks to Conductor."
