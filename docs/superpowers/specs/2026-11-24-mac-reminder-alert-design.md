# Mac reminder alert (Todo.app daemon) — design

Date: 2026-11-24 · Status: draft for approval
Builds on: `2026-11-19-mac-meeting-alert-design.md` (same daemon, same overlay)

## Intent

Conductor's reminders ("Take vitamins", "Take TRT", "Stand up", "Protein shake") only
fire while a Conductor browser tab is open — the `Reminders` overlay is mounted in
`AppShell`. Josh wants them to show up the way meeting alerts do now: the Todo.app
full-screen overlay, over every app, with no browser open. Then Conductor doesn't
have to be open at all.

## Goals

- Every active reminder alerts through Todo.app on its day and time, browser closed.
- Same choices as the browser has today, per reminder type (below).
- Stand-up / stretch reminders keep their countdown.
- One alert per reminder, never two (browser + Mac).

## Non-goals

- Editing reminders. They stay managed in the web app (Settings), unchanged.
- Changing the reminder rules (when a reminder is due, critical vs normal, snooze length).
  The Mac copies today's web behavior.
- A hotkey for reminders.
- Linux/iOS/other clients.

## Anti-goals

- A reminder firing twice — once in the browser, once on the Mac.
- A reminder the alert can't clear: every alert has a way off the screen.
- Counts anywhere ("3 reminders waiting"). No-badge rule.
- A second resident app, token, or installer.

## Current behavior (what the Mac copies)

Data: `Reminder` model — `label`, `hour`, `minute`, `days` (0=Sun..6=Sat), `active`,
`lastAckOn` (date), `icon` (pill | syringe | shake | stretch | laptop | mail),
`durationMin` (set = timed), `tier` ("critical" | "normal").

Rules in `src/components/Reminders.tsx`:

- **Due:** active, today is in `days`, local time ≥ hour:minute, not acked today. A
  reminder stays due for the rest of the day until acked — there is no end window.
- **One on screen at a time**, latest due time first; older ones resurface behind it.
- **Chime once** per reminder per day when it first comes due.
- **Normal, untimed:** primary button "Done" ("Taken" for pill/syringe) → ack. "Skip" → ack.
- **Critical:** primary "Taken"/"Done" → ack. "Snooze 5 min" instead of Skip — no way
  to skip it.
- **Timed (`durationMin`):** "Start" → countdown runs in a small corner pill, app stays
  usable. At zero: bell, "<label> complete" screen ("sit down" message for stand
  reminders), auto-clears after 2 minutes. Ack happens at zero.
- Ack = `POST /api/reminders/:id/ack`, sets `lastAckOn` = today; hides until tomorrow.

Today's reminders (12): 7 stand-ups and 1 stretch (timed, normal); vitamins, TRT,
Monday Outlook, Thursday HealthMap laptop (critical, untimed); protein shake (normal, untimed).

## Approaches considered

| Approach | Trade-off | Picked |
|---|---|---|
| Reminder watcher in the existing Todo.app daemon, next to `MeetingWatcher` | Reuses overlay, fetch loop, token, installer | **Yes** |
| macOS notification banners | Slide away on their own, easy to miss; not what he asked for | No |
| Keep the browser overlay | Needs Conductor open — the thing he's dropping | No |

## Design

### Server

- `GET /api/reminders/today` — bearer `MCP_API_TOKEN`, like `/api/meetings/today`.
  Returns `{ date, reminders: [...] }`: today's active reminders only (today's weekday
  in `days`, using `TIMEZONE`), each with `id`, `label`, `icon`, `tier`, `durationMin`,
  `ackedToday`, and `dueAt` — an absolute instant computed with `zonedInstant()`, so the
  Mac does no timezone math (same reason as meetings).
- `POST /api/reminders/:id/ack` accepts the bearer token as well as the session. The
  existing session path keeps working.

### Mac (Todo.app)

- `ReminderWatcher` beside `MeetingWatcher`: fetch every 60s (failed fetch keeps the last
  good list), tick every 10s.
- Pure `ReminderSchedule.swift` (tested in `mac/todo-app/tests/run.sh`, like
  `MeetingSchedule`) holds the rules: due, ordering latest-first, snooze 5 min for
  critical, local acks, day rollover.
- Overlay: reuse `MeetingOverlay`'s panel (full screen, non-activating, swallows keys
  except esc, shown on the menu-bar display). Reminder content: icon, label, time, and
  the buttons per type above. Look matches the meeting alert, not the web modal.
- **esc** = Snooze 5 min, for every reminder. Clearing for the day takes a click
  (Done/Taken/Skip/Start), so a stray esc can never drop a stand-up for the day.
- **Timed:** Start → overlay closes, a small always-on-top countdown sits in a screen
  corner. At zero: the reminder is acked, chime, a short "Sit down" / "<label> complete"
  card, auto-closes after 2 min or on click. Same as web: ack at zero. If the daemon
  restarts mid-countdown, the reminder simply shows again with Start.
- **Chime** once when a reminder first shows (`NSSound`, as meetings do).
- **Meeting first:** if a meeting alert is due, it holds the screen; the reminder waits
  and shows when the meeting alert is gone. A meeting coming due while a reminder is
  up replaces it at once; the reminder comes back afterwards without a second chime.
- **One Mac only: the MacBook Pro.** Todo.app runs on both the tower and the MacBook;
  only the MacBook shows reminders. A per-machine switch turns the reminder watcher on:
  the marker file `~/.conductor/reminders` (exists = on), read at daemon start, next to
  the existing `~/.conductor/url` and `capture-token`. Absent = no reminder watcher, so
  the tower stays quiet with no change. If the MacBook is closed or asleep, reminders
  don't fire; Josh accepted that. When it wakes, anything due and not acked shows.
- **Acks:** sent to the server immediately; a failed ack is retried on the next fetch
  and the reminder stays hidden locally meanwhile.

### Web

- Unmount `<Reminders />` from `AppShell`. Keep the component and routes (same as
  `MeetingAlert` on 2026-11-19). Settings > reminders editing is untouched.

## Decided by Josh

- Use the meeting-alert style overlay, not banners (2026-11-24).
- Timed reminders: corner countdown after Start (2026-11-24).
- Browser popup turns off; overlay rules per type, meeting-first — proposed and
  accepted (2026-11-24).
- Only the MacBook Pro shows reminders; nothing fires while it's closed (2026-11-24).

## My calls (flag if wrong)

- The on-switch is a marker file `~/.conductor/reminders`, not a build flag or setting.
- esc is Snooze 5 min on every reminder (builder check flagged esc-as-Skip as the
  "stand-up simply vanished" bug the web code already hit once).
- A meeting preempts a reminder already on screen; no re-chime when it returns.
- Reminders still have no end window, matching web: a missed 8:30 stand-up still shows
  later in the day until cleared.

## Left to the builder

- Corner countdown size, corner, styling.
- Whether `ReminderWatcher` and `MeetingWatcher` share one overlay controller or
  coordinate through a small "who holds the screen" check.
- Test cases for `ReminderSchedule`.
