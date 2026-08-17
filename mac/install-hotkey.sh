#!/bin/bash
# Install the ⌃⌥Space global hotkey: keeps Todo.app resident via a LaunchAgent so the
# capture window opens from anywhere, no Spotlight round-trip.
#
#   bash mac/install-hotkey.sh            # install + start
#   bash mac/install-hotkey.sh --uninstall
#
# Run mac/build-capture-app.sh first. To change the key combo, edit registerHotKey()
# in mac/todo-app/main.swift, rebuild, and re-run this.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.conductor.todo-hotkey"
APP_PATH="${APP_PATH:-/Applications/Todo.app}"
BINARY="$APP_PATH/Contents/MacOS/$(basename "$APP_PATH" .app)"
TEMPLATE="$SCRIPT_DIR/$LABEL.plist"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

unload() {
  launchctl bootout "$DOMAIN/$LABEL" 2> /dev/null || true
}

if [ "${1:-}" = "--uninstall" ]; then
  unload
  rm -f "$TARGET"
  echo "Hotkey removed. ⌘Space → 'todo' still works."
  exit 0
fi

if [ ! -x "$BINARY" ]; then
  echo "ERROR: $BINARY not found. Build the app first:"
  echo "  bash $SCRIPT_DIR/build-capture-app.sh"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
sed "s|__APP_BINARY__|$BINARY|" "$TEMPLATE" > "$TARGET"

# Reload cleanly — bootstrap fails if a stale copy is already registered
unload
launchctl bootstrap "$DOMAIN" "$TARGET"

sleep 1
if launchctl print "$DOMAIN/$LABEL" > /dev/null 2>&1; then
  echo "Installed. ⌃⌥Space opens the capture window from anywhere."
  echo ""
  echo "  Logs:      /tmp/conductor-todo-hotkey.log"
  echo "  Uninstall: bash $SCRIPT_DIR/install-hotkey.sh --uninstall"
else
  echo "WARNING: the agent didn't come up. Check /tmp/conductor-todo-hotkey.log"
  exit 1
fi
