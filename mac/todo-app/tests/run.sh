#!/bin/bash
# Build and run the MeetingSchedule + ReminderSchedule checks (pure logic, no AppKit).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${TMPDIR:-/tmp}/conductor-meeting-tests"
swiftc -o "$OUT" "$DIR/../MeetingSchedule.swift" "$DIR/../ReminderSchedule.swift" "$DIR/main.swift"
"$OUT"
