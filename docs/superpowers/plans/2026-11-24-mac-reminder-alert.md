# Mac Reminder Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conductor reminders (vitamins, TRT, stand-ups…) alert through the Todo.app daemon on the MacBook, with the browser overlay turned off.

**Architecture:** Two bearer-authed routes give the daemon today's reminders (with absolute `dueAt`) and let it ack one. A pure `ReminderSchedule.swift` holds the rules; `ReminderWatcher` polls, drives a full-screen overlay (reusing `AlertPanel`/`AlertBackdrop`) and a corner countdown, and yields to the meeting alert. A marker file turns it on per machine.

**Tech Stack:** Next.js 14 route handlers + Prisma + Vitest; Swift/SwiftUI/AppKit built by `swiftc` (no Xcode project).

**Spec:** `docs/superpowers/specs/2026-11-24-mac-reminder-alert-design.md`

## Global Constraints

- Bearer token is `MCP_API_TOKEN`; fail closed when unset (same as `/api/meetings/today`).
- Times: `dueAt` computed server-side with `zonedInstant(date, "HH:MM", TIMEZONE)`; the Mac does no timezone math.
- Snooze is 5 minutes (300 s), for every reminder. esc = snooze.
- Critical reminders have no Skip button. Primary label is "Taken" for icon `pill`/`syringe`, else "Done"; timed reminders show "Start".
- Timed reminder acks at countdown zero, not at Start.
- Reminder watcher runs only when `~/.conductor/reminders` exists.
- A meeting alert always wins the screen; a reminder that comes back after one does not chime again.
- No counts anywhere in the UI.
- Commit messages: no AI attribution (user rule).

## Review Focus

- MacBook wakes at 2 PM with four un-acked reminders from the morning → exactly one shows (latest due first), the rest follow one at a time as each is cleared. (Task 2: `latestDueFirst`.)
- Conductor unreachable (off Tailscale) → the last good list keeps alerting; an ack made offline stays hidden locally and is sent on the next good fetch. (Task 2: `unsyncedAckRetried`; Task 3 retry.)
- Day rolls over with the daemon running → yesterday's snoozes, local acks, and timers are dropped. (Task 2: `rolloverClears`.)
- Reminder acked in the browser Settings or by another path → disappears from the Mac at next fetch. (Task 2: `serverAckHides`.)
- Weekday filter uses `TIMEZONE`, not container UTC, so a Monday-only reminder doesn't show Sunday night at 8 PM ET. (Task 1: `usesTimezoneWeekday`.)

---

### Task 1: Server — today's reminders + bearer ack

**Files:**
- Create: `src/lib/bearer.ts`, `src/lib/reminders-today.ts`, `src/app/api/reminders/today/route.ts`
- Modify: `src/app/api/reminders/[id]/ack/route.ts`, `src/app/api/meetings/today/route.ts` (use `hasBearer`)
- Test: `src/lib/__tests__/reminders-today.test.ts`

**Interfaces:**
- Produces: `hasBearer(req: Request): boolean` — true iff `Authorization: Bearer <MCP_API_TOKEN>` and the env var is non-empty.
- Produces: `remindersForToday(rows: ReminderRow[], date: string /* YYYY-MM-DD in TIMEZONE */, weekday: number /* 0=Sun */, timeZone: string, todayStart: Date): TodayReminder[]` where `TodayReminder = { id, label, icon: string|null, tier: "critical"|"normal", durationMin: number|null, dueAt: string /* ISO */, ackedToday: boolean }`. Keeps `active && days.includes(weekday)`, sorted by `dueAt` ascending. `ackedToday` = `lastAckOn?.getTime() === todayStart.getTime()`.
- Produces: `weekdayOf(date: string): number` — `new Date(date + "T12:00:00Z").getUTCDay()`.
- Produces: `GET /api/reminders/today` → `{ date, reminders: TodayReminder[] }`, 401 without bearer. Uses `dayOf(new Date())` for `date`, `weekdayOf(date)`, `today()` for `todayStart`.
- Produces: `POST /api/reminders/:id/ack` accepts session **or** bearer.

- [ ] **Step 1: Write the failing tests** in `reminders-today.test.ts`:
  - `filtersByWeekdayAndActive`: rows with days `[1]`, `[2]`, and an inactive `[1]`; weekday 1 → only the first.
  - `computesDueAtInZone`: hour 9 minute 45, date `"2026-11-24"`, `"America/New_York"` → `dueAt === "2026-11-24T14:45:00.000Z"`.
  - `usesTimezoneWeekday`: `weekdayOf("2026-11-23") === 1` and `weekdayOf("2026-11-22") === 0` — the weekday comes from the TIMEZONE date string, never the server clock.
  - `marksAckedToday`: `lastAckOn` equal to `todayStart` → true; yesterday → false.
  - `sortsByDueAt`: 15:00 row before a 09:45 row in input → output 09:45 first.
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/reminders-today.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `remindersForToday` and `hasBearer`; HH:MM via `String(h).padStart(2,"0")`.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Write the route and the ack change; swap `authorized()` in `meetings/today` for `hasBearer`.
- [ ] **Step 6:** `npx tsc --noEmit -p . && npm test` → clean, all pass.
- [ ] **Step 7:** Rebuild the tower container (`docker compose up -d --build conductor`), then
  `curl -s -H "Authorization: Bearer $(cat ~/.conductor/capture-token)" localhost:5402/api/reminders/today` → JSON with today's reminders; without the header → 401.
- [ ] **Step 8:** Commit `feat: bearer-authed reminders feed for Todo.app`.

### Task 2: `ReminderSchedule.swift` (pure rules)

**Files:**
- Create: `mac/todo-app/ReminderSchedule.swift`
- Modify: `mac/todo-app/tests/run.sh` (add the file to `swiftc`), `mac/todo-app/tests/main.swift` (append checks)

**Interfaces:**
- Consumes: Task 1's JSON shape.
- Produces:
  - `struct Reminder: Decodable, Identifiable, Hashable { id, label: String; icon: String?; tier: String; durationMin: Int?; dueAt: Date; ackedToday: Bool; var isCritical: Bool; var isTimed: Bool; var primaryLabel: String }` — `primaryLabel` = "Start" if timed, "Taken" for pill/syringe, else "Done".
  - `struct RemindersResponse: Decodable { date: String; reminders: [Reminder] }` decoded with `MeetingsResponse.decoder`.
  - `struct ReminderSchedule` with `static let snooze: TimeInterval = 300` and:
    `mutating replace(_:[Reminder], day:)` (same day keeps local state, new day clears),
    `mutating rollover(to:)`, `mutating ack(_ id)`, `mutating snooze(_ id, now:)`,
    `mutating start(_ id, now:)` (runningUntil = now + durationMin·60),
    `func due(now:) -> Reminder?`, `func running(now:) -> (Reminder, Date)?` (the timer to show and its end),
    `mutating finished(now:) -> [Reminder]` (timers past their end, removed and locally acked),
    `func unsyncedAcks() -> [String]` (locally acked ids the last fetch still reports `ackedToday == false`).
  - Due rule: `dueAt <= now && !ackedToday && !locallyAcked && !running && !(snoozed && now < until)`; pick latest `dueAt` first.

- [ ] **Step 1: Write the failing checks** (append to `tests/main.swift`, same `check()` helper): `notDueBeforeTime`, `dueAtTime`, `latestDueFirst` (09:45 and 15:00 both due at 15:01 → 15:00), `localAckHides`, `serverAckHides` (`ackedToday: true` → nil), `snoozeFiveMinutes` (hidden at +299 s, back at +300 s), `startHidesWhileRunning`, `finishedReturnsAndAcks` (start at t, finished at t+15 min returns it once, then due is nil), `unsyncedAckRetried` (local ack + refreshed list with `ackedToday:false` → listed; with `true` → empty), `rolloverClears` (snooze/ack/timer gone after new day), `primaryLabels` (pill→Taken, stretch timed→Start, mail→Done).
- [ ] **Step 2:** `bash mac/todo-app/tests/run.sh` → build fails (type not found).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run → every line `ok`, including the existing meeting checks.
- [ ] **Step 5:** Commit `feat(todo-app): reminder schedule rules`.

### Task 3: Watcher, overlay, countdown, wiring

**Files:**
- Create: `mac/todo-app/ReminderWatcher.swift`, `mac/todo-app/ReminderOverlay.swift`
- Modify: `mac/todo-app/main.swift` (`Config.remindersOn`, `API.reminders`, `API.ackReminder`, AppDelegate wiring), `mac/todo-app/MeetingWatcher.swift` (`var isShowing: Bool`, `var onAlertChange: (() -> Void)?`)

**Interfaces:**
- Consumes: Task 2 types; Task 1 routes; `AlertPanel`, `AlertBackdrop` from `MeetingOverlay.swift`.
- Produces: `API.reminders(_ cfg) async throws -> RemindersResponse` (GET `/api/reminders/today`, same guard/timeout/`check` as `API.meetings`); `API.ackReminder(_ cfg, id:) async throws` (POST `/api/reminders/<id>/ack`).
- Produces: `Config.remindersOn: Bool` = `FileManager.default.fileExists` at `~/.conductor/reminders`.
- Produces: `ReminderWatcher(cfg:, meeting: MeetingWatcher)` with `start()`; fetch 60 s, tick 10 s, plus a 1 s tick only while a countdown runs.

Behavior to build (the decisions; layout is the builder's):
- Tick: rollover → handle `finished(now:)` (ack on server, chime "Glass", show the done card) → if `meeting.isShowing`, hide the reminder overlay and stop → else show/update `due(now:)`.
- `MeetingWatcher` calls `onAlertChange?()` after every show and hide so the reminder yields or returns at once, not on its next 10 s tick.
- Overlay: full screen like the meeting alert, panel level `.screenSaver - 1` (meeting stays on top even for one frame). Card shows icon (SF Symbols: pill→`pills.fill`, syringe→`syringe.fill`, shake→`waterbottle.fill`, stretch→`figure.stand`, laptop→`laptopcomputer`, mail→`envelope.fill`), label, time, eyebrow "Don't skip this" (critical) / "Time to move" (timed) / "Reminder".
- Buttons: primary (`primaryLabel`) → ack, or Start for timed; second button "Snooze 5 min" if critical, else "Skip" (→ ack). esc → snooze for all.
- Chime when a reminder first shows and when it returns from a snooze. Returning after a meeting preempted it does not chime (track `preempted: Set<String>`, cleared on rollover).
- Ack: update schedule locally first, then `API.ackReminder`; on each successful fetch, re-send `unsyncedAcks()`.
- Countdown: small non-activating panel, level `.floating`, top-right of `NSScreen.screens.first`'s `visibleFrame`, showing icon, label, `m:ss`. At zero it becomes the done card: "Sit down" if the label matches /stand/i, else "<label> complete", closes on click or after 120 s.
- AppDelegate: in daemon mode, `if cfg.remindersOn { reminderWatcher.start() }` after `meetingWatcher.start()`.

- [ ] **Step 1:** Add `isShowing` / `onAlertChange` to `MeetingWatcher`; `bash mac/todo-app/tests/run.sh` still all `ok`.
- [ ] **Step 2:** Add API calls, `Config.remindersOn`, `ReminderWatcher`, `ReminderOverlay`, wiring.
- [ ] **Step 3:** Build: `bash mac/build-capture-app.sh` → succeeds with no errors.
- [ ] **Step 4:** Manual check on the tower (temporarily): `touch ~/.conductor/reminders`, create a test reminder 2 min out in Settings (normal, untimed), `launchctl kickstart -k gui/$(id -u)/com.conductor.todo-hotkey`; confirm: overlay appears with chime, esc hides it for 5 min, Done clears it and `/api/reminders/today` shows `ackedToday: true`. Repeat with a 1-min timed reminder: Start → corner countdown → done card. Then delete the test reminders and `rm ~/.conductor/reminders` (tower must stay quiet), kickstart again.
- [ ] **Step 5:** Commit `feat(todo-app): reminder alerts in the daemon`.

### Task 4: Turn off the browser overlay, document, hand off

**Files:**
- Modify: `src/components/AppShell.tsx` (remove `<Reminders />` and its import; leave a one-line comment like the `MeetingAlert` one), `CLAUDE.md` (new "Reminder alert (Todo.app daemon)" subsection under Spotlight quick capture; update the "Alert layer" paragraph)

- [ ] **Step 1:** Unmount; `npx tsc --noEmit -p . && npx next lint` clean.
- [ ] **Step 2:** Rebuild the tower container; load `/` and confirm no reminder modal appears for a due, un-acked reminder.
- [ ] **Step 3:** Write the CLAUDE.md section: routes, `ReminderSchedule` rules, marker file, MacBook-only, rebuild + kickstart note.
- [ ] **Step 4:** Commit `feat: reminders move from the browser to Todo.app`.
- [ ] **Step 5:** Tell Josh the MacBook steps (can't be run from the tower): `git pull`, `bash mac/build-capture-app.sh`, `touch ~/.conductor/reminders`, `launchctl kickstart -k gui/$(id -u)/com.conductor.todo-hotkey`.
