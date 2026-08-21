#!/bin/bash
# Build /Applications/Conductor.app — the native window around the web app.
#
# Run once per machine, and again after editing anything in mac/conductor-app/.
# Needs the Xcode command line tools for swiftc: xcode-select --install
#
# This is a different app from Todo.app and does not touch it. Todo.app keeps its
# own bundle, its own LaunchAgent (com.conductor.todo-hotkey) and ⌃⌥Space.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$SCRIPT_DIR/conductor-app"
APP_NAME="${APP_NAME:-Conductor}"
APP_PATH="${APP_PATH:-/Applications/$APP_NAME.app}"

if ! command -v swiftc > /dev/null 2>&1; then
  echo "ERROR: swiftc not found. Install the Xcode command line tools:"
  echo "  xcode-select --install"
  exit 1
fi
for f in main.swift WebWindow.swift ErrorView.swift; do
  [ -f "$SRC_DIR/$f" ] || { echo "ERROR: $SRC_DIR/$f not found"; exit 1; }
done

# Shared with Todo.app, so pointing a laptop at the tower configures both.
mkdir -p "$HOME/.conductor"
if [ ! -f "$HOME/.conductor/url" ]; then
  echo "http://localhost:5402" > "$HOME/.conductor/url"
  echo "Wrote ~/.conductor/url (edit this on a client machine to point at the tower)"
fi

# Quit any running copy first. Todo.app taught this lesson the hard way: replace
# the binary under a running process and the next launch reopens the old one.
if pgrep -x "$APP_NAME" > /dev/null 2>&1; then
  echo "Quitting the running $APP_NAME ..."
  osascript -e "tell application \"$APP_NAME\" to quit" > /dev/null 2>&1 || pkill -x "$APP_NAME" || true
  sleep 1
fi

echo "Building $APP_PATH ..."
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"

swiftc -O -o "$APP_PATH/Contents/MacOS/$APP_NAME" \
  "$SRC_DIR/main.swift" "$SRC_DIR/WebWindow.swift" "$SRC_DIR/ErrorView.swift"

cat > "$APP_PATH/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>io.jtmg.conductor.shell</string>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <!--
    Conductor is served over plain http on the LAN and over Tailscale, and App
    Transport Security blocks http from a native app by default. Scoped
    exceptions rather than NSAllowsArbitraryLoads: local networking covers
    localhost, and ts.net covers the tower — where the traffic is already inside
    an encrypted WireGuard tunnel. Same policy as Todo.app.
  -->
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSExceptionDomains</key>
    <dict>
      <key>ts.net</key>
      <dict>
        <key>NSIncludesSubdomains</key><true/>
        <key>NSExceptionAllowsInsecureHTTPLoads</key><true/>
      </dict>
      <key>localhost</key>
      <dict>
        <key>NSExceptionAllowsInsecureHTTPLoads</key><true/>
      </dict>
    </dict>
  </dict>
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
    && echo "Icon embedded" || echo "Icon skipped (iconutil failed)"
  rm -rf "$(dirname "$ICONSET")"
fi

codesign --force --sign - "$APP_PATH" 2>/dev/null || true
mdimport "$APP_PATH" > /dev/null 2>&1 || true

echo ""
echo "Done: $APP_PATH"
echo "  Points at: $(cat "$HOME/.conductor/url")"
echo ""
echo "  open -a $APP_NAME"
echo ""
echo "  Closing the window quits the app. ⌘R reloads."
