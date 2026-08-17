#!/bin/bash
# Build /Applications/Todo.app — the ⌘Space capture window.
#
# Run once per machine (and again after editing mac/todo-app/main.swift). Needs the
# Xcode command line tools for swiftc: xcode-select --install
#
# Named "Todo" deliberately: "conductor" collides with the open Conductor browser
# window in Spotlight, which always outranks an app. "todo" has no competition.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$SCRIPT_DIR/todo-app/main.swift"
APP_NAME="${APP_NAME:-Todo}"
APP_PATH="${APP_PATH:-/Applications/$APP_NAME.app}"

if ! command -v swiftc > /dev/null 2>&1; then
  echo "ERROR: swiftc not found. Install the Xcode command line tools:"
  echo "  xcode-select --install"
  exit 1
fi
if [ ! -f "$SOURCE" ]; then
  echo "ERROR: $SOURCE not found"
  exit 1
fi

# --- config: token + URL live outside the repo so the app works on any machine ---
mkdir -p "$HOME/.conductor"
if [ ! -f "$HOME/.conductor/capture-token" ] && [ -f "$REPO_DIR/.env" ]; then
  grep -m1 '^MCP_API_TOKEN=' "$REPO_DIR/.env" \
    | cut -d= -f2- | tr -d '\r\n' | sed -e 's/^["'\'']//' -e 's/["'\'']$//' \
    > "$HOME/.conductor/capture-token"
  chmod 600 "$HOME/.conductor/capture-token"
  echo "Wrote ~/.conductor/capture-token from the repo .env"
fi
if [ ! -f "$HOME/.conductor/url" ]; then
  echo "http://localhost:5402" > "$HOME/.conductor/url"
  echo "Wrote ~/.conductor/url (edit this on a client machine to point at the tower)"
fi
if [ ! -s "$HOME/.conductor/capture-token" ]; then
  echo "WARNING: ~/.conductor/capture-token is empty — the app will get 401s."
  echo "         Put the tower's MCP_API_TOKEN in it."
fi

# Retire the AppleScript version this replaced
if [ -d "/Applications/Conductor Capture.app" ]; then
  rm -rf "/Applications/Conductor Capture.app"
  echo "Removed the old Conductor Capture.app"
fi

# --- bundle ---
echo "Building $APP_PATH ..."
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"

swiftc -O -o "$APP_PATH/Contents/MacOS/$APP_NAME" "$SOURCE"

cat > "$APP_PATH/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>io.jtmg.conductor.todo</string>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <!--
    Conductor is served over plain http on the LAN and over Tailscale, and App Transport
    Security blocks http from a native app by default (curl and shell scripts are exempt,
    which is why the CLI helper never hit this). Scoped exceptions rather than
    NSAllowsArbitraryLoads: local networking covers localhost/.local, and ts.net covers the
    tower over Tailscale — where the traffic is already inside an encrypted WireGuard tunnel.
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

# Icon from the app's own PWA icon, so it looks like Conductor in Spotlight
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

# Nudge Spotlight so the app is findable immediately
mdimport "$APP_PATH" > /dev/null 2>&1 || true

echo ""
echo "Done: $APP_PATH"
echo ""
echo "  ⌘Space → 'todo' → Enter"
echo ""
echo "  In the window:  ⌘1…9 pick company   ⌘T today/backlog   Enter add   Esc cancel"
