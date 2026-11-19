# Mac meeting alert + today's-meetings hotkey — design

Date: 2026-11-19 · Status: draft for approval
Mockup: https://claude.ai/artifact/Ayw35kxQj8U1EDMo42Lw5m (alert overlay + hotkey panel)

## Intent

Josh misses meetings when Conductor isn't the window in front of him. The web
`MeetingAlert` (`src/components/MeetingAlert.tsx`) only fires while a Conductor
browser tab is open, and macOS notifications are easy to miss. He wants:

1. A big overlay that covers the screen shortly before each meeting. Not an
   Apple notification.
2. A hotkey that shows today's meetings at a glance.

## Goals

- The overlay appears over every app on every screen, whether or not a browser
  is open.
- One keypress opens a list of today's remaining meetings.
- One alert per meeting, never two.

## Non-goals

- **No Join button / no meeting links.** Josh chose "alert only". Conductor
  doesn't store join links (`Meeting` has no location/url field, and
  `cron/calendar-events.swift` cuts notes at 200 characters). Out of scope.
- No prep-task line on the overlay (`CALENDAR_PREP_TASKS=off`, so there are none).
- No meeting editing, no other days, no notification-center integration.

## Anti-goals

- An alert that fires twice (web + Mac) for the same meeting.
- An alert that steals focus mid-typing and eats keystrokes into the overlay's buttons.
- Counts anywhere ("4 meetings today"). Follows the no-badge rule.
- A second resident app, token, or installer.

## Approaches considered

| Approach | Trade-off | Picked |
|---|---|---|
| **Extend Todo.app + new bearer API** | Reuses the resident daemon, Carbon hotkey, `~/.conductor/{url,capture-token}` config. Gets company colors, ignore patterns, hidden meetings from the server. Works on the laptop over Tailscale. | **Yes** — Josh picked it |
| Todo.app reads EventKit directly | No server dependency, but loses colors / ignore rules / hidden meetings and needs a second Calendar TCC grant. | No |
| Separate new app | Same data as the pick, but duplicates daemon, hotkey, token, installer. | No |

## Decisions (Josh's)

- Alert only, no Join (above).
- Turn off the web alert: unmount `<MeetingAlert />` from `AppShell.tsx:131`.
  The component file stays in the repo, unmounted — same pattern as `CommsSweepAlert`.
- Build into Todo.app, fed by a new bearer-authed endpoint.
- The look in the mockup.

## Defaults (stated to Josh, not corrected)

- Alert fires **2 minutes** before start (matches the web default).
- Shows on **every screen**.
- **Snooze** = 1 minute. **Dismiss** = done for that meeting.
- Ignored (`isIgnored`) and hidden (`userHidden`) meetings never alert or list.
- Hotkey **⌃⌥M** opens the panel. ⌃⌥Space stays capture.

## The design

### 1. Server: `GET /api/meetings/today` (bearer)

New route, same auth as `/api/capture` (`Authorization: Bearer $MCP_API_TOKEN`,
fails closed if unset). Returns today's meetings in `TIMEZONE`:

```json
{
  "date": "2026-11-19",
  "meetings": [
    { "id": "…", "title": "Sprint Planning",
      "startsAt": "2026-11-19T15:00:00.000Z", "endsAt": "2026-11-19T15:30:00.000Z",
      "startTime": "10:00", "endTime": "10:30",
      "company": { "name": "vQuip", "color": "#2dd4bf" } }
  ]
}
```

- Same filter as the existing today path in `src/app/api/meetings/route.ts`:
  `date = today, isIgnored false, userHidden false`, ordered by `startTime`.
- `startsAt`/`endsAt` are absolute instants computed server-side from
  `date` + `HH:MM` in `TIMEZONE`, so the app never does timezone math and a
  laptop in another timezone still alerts at the right moment.
- Pure conversion helper (date + HH:MM + tz → ISO) in `src/lib/`, unit-tested.

### 2. Todo.app: meeting watcher

- Daemon mode only. Fetches the endpoint on launch, then every **60s**.
- Checks the clock every **10s**. A meeting is due when
  `startsAt - 2min <= now <= startsAt + 2min` (the web's `GRACE_MIN`), and it
  isn't dismissed or snoozed.
- If the fetch fails (tower down, off Tailscale), keep the last good list so
  alerts still fire. The day rolling over clears the list.
- Dismissed IDs live in memory, keyed by date. A daemon restart can re-fire an
  alert that's still inside its window. That's acceptable.

### 3. The overlay

- One borderless `NSPanel` per `NSScreen`, sized to the full screen frame,
  level `.screenSaver` (above full-screen apps and the menu bar),
  `collectionBehavior` `[.canJoinAllSpaces, .fullScreenAuxiliary]`.
- **Title-free (Josh's call).** The overlay may be on a screen share, so it shows
  nothing that names the meeting or the company. The card has the company-color
  dot (no name), "MEETING IN", a large live minute count ("2 min" → "1 min" →
  "Starting now"), `10:00 – 10:30 AM`, then **Snooze 1 min** and
  **Dismiss esc**, plus a hint line, "⌃⌥M for details". That's a deliberate
  change from the mockup: no title, no company name, no "Next:" line. Details
  live only in the ⌃⌥M panel.
- The card is only on the main screen. Other screens get just the dimmed backdrop.
- Plays a chime once when it appears (system sound, e.g. `NSSound(named: "Glass")`).
- Focus *(builder call)*: the main-screen panel becomes key, so it receives
  `esc` with no Accessibility grant. Keystrokes typed while it's up go nowhere,
  and that's acceptable for a 2-minute warning. Only `esc` and clicks act on it.
  There's no Return or Space binding, so mid-sentence typing can't snooze or
  dismiss it. When it closes, focus goes back to the previous app
  (`NSRunningApplication.activate`).
- Snooze *(builder call)*: always guarantees one more alert, even when the
  snooze runs past the normal window. A snoozed meeting is due at
  `snoozedUntil`, whatever the window says.
- If two meetings are due at once, show the earliest. The other appears after
  that one is dismissed.

### 4. The hotkey panel (⌃⌥M)

- A second Carbon hotkey (`id: 2`) on the existing handler. The handler must
  read the `EventHotKeyID` from the event and route `1` → capture window,
  `2` → panel. Today it ignores the id (`main.swift:506-529`).
- A floating, centered window like the mockup: header "Today" + date + hint,
  one row per meeting that hasn't ended yet (time, company dot, title,
  `company · duration`). The next upcoming row is highlighted with an
  "in N min" pill. No location/platform text, since we don't store it.
- Empty day: one line, "No more meetings today."
- `esc` or ⌃⌥M again closes it. Uses the cached list, then refreshes.

### 5. Web app

- Remove `<MeetingAlert />` from `AppShell.tsx`. Keep the file.
- The "meeting alert lead time" control in `SettingsPage.tsx` (~line 1300) writes
  localStorage only the web alert read, so it would do nothing. Remove the control.
  The app uses a fixed 2 minutes.
- Fix the now-stale comment in `src/lib/alert-lock.ts` and the "Alert layer"
  section in `CLAUDE.md`.

### 6. Ops

- **Runs on Josh's MacBook Pro (Josh's call), the only machine he uses.** It's
  a client machine: the repo clone plus `~/.conductor/url` (the tower's
  Tailscale URL) and `~/.conductor/capture-token`. The Todo hotkey daemon is
  installed there. One machine means one alert, so dismissals stay in memory
  and nothing is synced. Off Tailscale, it alerts from the last list it fetched.

- Rebuild with `bash mac/build-capture-app.sh`, then
  `launchctl kickstart -k gui/$(id -u)/com.conductor.todo-hotkey`. That restart
  is required (see CLAUDE.md).
- No new permissions. Carbon hotkeys need no Accessibility grant, and the
  overlay needs no TCC.
- Document ⌃⌥M in `CLAUDE.md`'s quick-reference table and the Spotlight section.

## Left to the builder

- SwiftUI file layout (split `main.swift` or not).
- The exact chime sound, animation, and fonts, as long as it matches the mockup.
- How the 10s tick and 60s fetch are scheduled (Timer vs async loop).
- Test approach for the Swift side (manual is fine; the server helper gets Vitest).
