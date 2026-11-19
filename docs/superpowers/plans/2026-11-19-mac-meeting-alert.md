# Mac Meeting Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo.app puts a title-free full-screen overlay up 2 minutes before each meeting, and ⌃⌥M opens a list of today's meetings. The web alert is retired.

**Architecture:** A new bearer-authed `GET /api/meetings/today` returns today's meetings, with absolute `startsAt`/`endsAt` instants computed server-side in `TIMEZONE`. The resident `Todo.app --daemon` fetches it every 60s and checks the clock every 10s against pure scheduling logic. When a meeting is due, it shows one borderless panel per screen. A second Carbon hotkey opens the panel.

**Tech Stack:** Next.js 14 route handler + Prisma, Vitest; Swift 5 / SwiftUI / AppKit / Carbon, built with `swiftc` by `mac/build-capture-app.sh`.

**Spec:** `docs/superpowers/specs/2026-11-19-mac-meeting-alert-design.md`

## Global Constraints

- Auth: `Authorization: Bearer $MCP_API_TOKEN`, fails closed if unset (copy `authorized()` from `src/app/api/capture/route.ts`).
- Filter: `date = today, isIgnored false, userHidden false`, ordered by `startTime`.
- Lead time is fixed: **2 minutes** before `startsAt`. Grace: due until **2 minutes after** `startsAt`.
- Fetch every **60s**; clock tick every **10s**.
- Snooze = **1 minute** and always guarantees one more alert. Dismiss = done for that meeting today.
- Overlay is **title-free**: no meeting title, no company name, no "Next:" line. It shows the color dot, "MEETING IN", the live count ("2 min" / "1 min" / "Starting now"), `10:00 – 10:30 AM`, Snooze 1 min, Dismiss esc, and "⌃⌥M for details".
- Overlay keys: `esc` dismisses. No Return or Space binding.
- Hotkeys: ⌃⌥Space = capture (id 1), ⌃⌥M = panel (id 2).
- No new macOS permissions. No new resident app. No counts in any UI copy.
- Runs on Josh's MacBook Pro as a client (`~/.conductor/url` → tower Tailscale URL).
- Commit messages: Conventional Commits, no AI attribution.

## Review Focus

- **Tower unreachable at launch (no cached list):** no crash, no overlay. It keeps retrying every 60s and alerts normally once a fetch succeeds. → Task 4 manual check.
- **Midnight rollover:** yesterday's list, dismissals, and snoozes are dropped when the local day changes, even if the fetch fails. → Task 3 test `rolloverClearsState`.
- **Two meetings due at once:** the earliest `startsAt` shows. The other shows after the first is dismissed. → Task 3 test `earliestDueWins`.
- **Laptop wakes from sleep mid-window or after it:** waking 1 min after start alerts. Waking 3+ min after start does not, unless it was snoozed. → Task 3 tests `wakeInsideGraceAlerts`, `wakeAfterGraceSilent`.
- **Meeting hidden or deleted while its overlay is up:** the next fetch drops it, so the overlay closes. → Task 3 test `vanishedMeetingNotDue` + Task 4 wiring.

---

### Task 1: Zoned-time helper

**Files:**
- Create: `src/lib/zoned-time.ts`
- Test: `src/lib/__tests__/zoned-time.test.ts`

**Interfaces:**
- Produces: `zonedInstant(date: string, hhmm: string, timeZone: string): Date`. `date` is `YYYY-MM-DD`, `hhmm` is `HH:MM` wall-clock in `timeZone`. Returns the UTC instant.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { zonedInstant } from "../zoned-time";

describe("zonedInstant", () => {
  it("EST winter offset", () => {
    expect(zonedInstant("2026-11-19", "10:00", "America/New_York").toISOString()).toBe("2026-11-19T15:00:00.000Z");
  });
  it("EDT summer offset", () => {
    expect(zonedInstant("2026-07-01", "10:00", "America/New_York").toISOString()).toBe("2026-07-01T14:00:00.000Z");
  });
  it("day after DST ends", () => {
    expect(zonedInstant("2026-11-02", "09:30", "America/New_York").toISOString()).toBe("2026-11-02T14:30:00.000Z");
  });
  it("late evening stays on the same local date", () => {
    expect(zonedInstant("2026-11-19", "23:30", "America/New_York").toISOString()).toBe("2026-11-20T04:30:00.000Z");
  });
  it("other zone", () => {
    expect(zonedInstant("2026-11-19", "10:00", "America/Los_Angeles").toISOString()).toBe("2026-11-19T18:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run src/lib/__tests__/zoned-time.test.ts` → "Cannot find module '../zoned-time'".

- [ ] **Step 3: Implement `zonedInstant`** — guess the instant as if UTC, read that instant's wall-clock in `timeZone` via `Intl.DateTimeFormat(..., { hourCycle: "h23" }).formatToParts`, subtract the difference, and repeat once to settle across DST. No new dependency.

- [ ] **Step 4: Run, expect PASS** — same command, 5 passed.

- [ ] **Step 5: Commit** — `git add src/lib/zoned-time.ts src/lib/__tests__/zoned-time.test.ts && git commit -m "feat(meetings): add zonedInstant helper"`

### Task 2: `GET /api/meetings/today`

**Files:**
- Create: `src/app/api/meetings/today/route.ts`

**Interfaces:**
- Consumes: `zonedInstant` (Task 1); `dayOf(new Date())` from `src/lib/dates.ts` for today's `YYYY-MM-DD`.
- Produces (JSON, consumed by Task 3's `MeetingsResponse`):

```json
{ "date": "2026-11-19",
  "meetings": [ { "id": "…", "title": "…", "startsAt": "ISO", "endsAt": "ISO",
                  "startTime": "10:00", "endTime": "10:30",
                  "company": { "name": "vQuip", "color": "#2dd4bf" } } ] }
```

- [ ] **Step 1: Implement the GET handler** — `export const dynamic = "force-dynamic"`. 401 `{ error: "Unauthorized" }` when the bearer check fails. Query `prisma.meeting.findMany` with the Global Constraints filter, `select` only the fields above plus `role { name color }`. Map `role` → `company`. Use `process.env.TIMEZONE || "America/New_York"` for `zonedInstant`. Prisma comes from `@/lib/prisma`.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` is clean. Then `docker compose up -d --build`, and:
  - `curl -s -o /dev/null -w '%{http_code}' localhost:5402/api/meetings/today` → `401`
  - `curl -s -H "Authorization: Bearer $(cat ~/.conductor/capture-token)" localhost:5402/api/meetings/today | python3 -m json.tool` → today's date, and each meeting's `startsAt` matches its `startTime` in Eastern.

- [ ] **Step 3: Commit** — `git commit -m "feat(meetings): bearer endpoint for today's meetings"`

### Task 3: Pure meeting schedule (Swift) + multi-file build

**Files:**
- Modify: `mac/build-capture-app.sh` — compile `"$SCRIPT_DIR"/todo-app/*.swift` instead of `$SOURCE` alone (keep the existence check on `main.swift`).
- Create: `mac/todo-app/MeetingSchedule.swift`
- Create: `mac/todo-app/tests/MeetingScheduleTests.swift`
- Create: `mac/todo-app/tests/run.sh` — `swiftc -o "$TMPDIR/meeting-tests" ../MeetingSchedule.swift MeetingScheduleTests.swift && "$TMPDIR/meeting-tests"` (paths relative to the script dir). Exits non-zero on the first failed check.

**Interfaces:**
- Produces:

```swift
struct MeetingCompany: Decodable, Hashable { let name: String; let color: String }
struct Meeting: Decodable, Identifiable, Hashable {
    let id: String; let title: String
    let startsAt: Date; let endsAt: Date
    let startTime: String; let endTime: String
    let company: MeetingCompany
}
struct MeetingsResponse: Decodable { let date: String; let meetings: [Meeting] }

struct MeetingSchedule {
    static let lead: TimeInterval = 120
    static let grace: TimeInterval = 120
    static let snooze: TimeInterval = 60
    private(set) var day: String          // local YYYY-MM-DD the state belongs to
    private(set) var meetings: [Meeting]
    mutating func replace(_ meetings: [Meeting], day: String)   // a new day clears dismissed/snoozed
    mutating func rollover(to day: String)                      // drops everything if day differs
    mutating func dismiss(_ id: String)
    mutating func snooze(_ id: String, now: Date)               // snoozedUntil = now + 60
    func due(now: Date) -> Meeting?                             // earliest due, nil if none
    func upcoming(now: Date) -> [Meeting]                       // endsAt > now, by startsAt
    static func countdown(_ m: Meeting, now: Date) -> String    // "2 min" | "1 min" | "Starting now"
}
```

The decoder uses `.iso8601` with fractional seconds (a custom `ISO8601DateFormatter` with `.withFractionalSeconds`).

- [ ] **Step 1: Write the failing tests** in `MeetingScheduleTests.swift`: a `check(_ cond: Bool, _ name: String)` helper plus a top-level run. Fixture: meeting A `startsAt = t0`, B `startsAt = t0`+30s, both on day `"2026-11-19"`.
  - `notDueEarly`: `due(now: t0 - 121)` == nil
  - `dueAtLead`: `due(now: t0 - 120)?.id == A`
  - `earliestDueWins`: A and B both due at `t0` → A; after `dismiss(A)` → B
  - `wakeInsideGraceAlerts`: `due(now: t0 + 60)?.id == A`
  - `wakeAfterGraceSilent`: `due(now: t0 + 121)` == nil
  - `snoozeHides`: `snooze(A, now: t0)` → `due(now: t0 + 30)` is not A
  - `snoozeAlwaysReturns`: `snooze(A, now: t0 + 110)` → `due(now: t0 + 170)?.id == A` (past grace)
  - `dismissIsFinal`: `dismiss(A)` → A never due again that day
  - `vanishedMeetingNotDue`: after `replace([B], day: same)`, A is never returned
  - `rolloverClearsState`: `dismiss(A)` then `rollover(to: "2026-11-20")` → `meetings` empty, then after `replace([A], day: "2026-11-20")` A can be due
  - `countdownCopy`: `t0-120` → "2 min", `t0-61` → "2 min" (round up), `t0-60` → "1 min", `t0` → "Starting now", `t0+60` → "Starting now"
  - `decodesServerJSON`: decode a literal copy of Task 2's JSON with `"2026-11-19T15:00:00.000Z"`

- [ ] **Step 2: Run, expect FAIL** — `bash mac/todo-app/tests/run.sh` → compile error (missing `MeetingSchedule`).

- [ ] **Step 3: Implement `MeetingSchedule.swift`** to the signatures above. Snoozed meetings are due at `now >= snoozedUntil`, whatever the window says.

- [ ] **Step 4: Run, expect PASS** — `bash mac/todo-app/tests/run.sh` → every check passes, exit 0. Also `bash mac/build-capture-app.sh` still builds.

- [ ] **Step 5: Commit** — `git commit -m "feat(todo-app): pure meeting schedule with tests"`

### Task 4: Watcher + title-free overlay

**Files:**
- Create: `mac/todo-app/MeetingWatcher.swift`
- Create: `mac/todo-app/MeetingOverlay.swift`
- Modify: `mac/todo-app/main.swift` — add `static func meetings(_ cfg: Config) async throws -> MeetingsResponse` to the existing API enum, next to `options` (GET `/api/meetings/today`, same bearer header and `check()`). In `applicationDidFinishLaunching`, start the watcher when `isDaemon`.

**Interfaces:**
- Consumes: `MeetingSchedule`, `Meeting`, `MeetingsResponse` (Task 3); the `meetings` API call.
- Produces: `final class MeetingWatcher { init(cfg: Config); func start(); var schedule: MeetingSchedule { get }; func refresh() async }`. Task 5 reads `schedule.upcoming(now:)` and calls `refresh()`.

- [ ] **Step 1: Implement `MeetingWatcher`** (main actor). `start()` fetches immediately, then on a 60s timer. A failed fetch keeps the old list. A success calls `replace(_:day:)` with the local day (`DateFormatter` `yyyy-MM-dd`, current zone). A 10s timer calls `rollover(to: localDay)`, then `due(now:)`. If it's non-nil and differs from what's shown, show the overlay. If it's nil and an overlay is up, hide it.

- [ ] **Step 2: Implement `MeetingOverlay`**: `show(meeting:, onSnooze:, onDismiss:)` and `hide()`.
  - One borderless `NSPanel` per `NSScreen.screens`, frame = `screen.frame`, `level = .screenSaver`, `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]`, `backgroundColor = .clear`.
  - The dim backdrop is `rgba(12,12,11,0.82)`. The card goes only on `NSScreen.main`, using the mockup's colors (`#1E1E1B` card, `#333330` border, `#D4785A` accent, `#E8E4DD` text, `#A8A29E` secondary) and the title-free copy from Global Constraints.
  - Before showing, save `NSWorkspace.shared.frontmostApplication`. Make the main panel key (`canBecomeKey` override → true), and route `esc` → dismiss via `.onExitCommand` or a `keyDown` override. On hide, re-activate the saved app.
  - Play `NSSound(named: "Glass")` once per meeting id.
  - The count text refreshes every 10s through the watcher's tick.
  - Rebuild the panels on `NSApplication.didChangeScreenParametersNotification` while shown.

- [ ] **Step 3: Verify manually** — build and restart the daemon (`bash mac/build-capture-app.sh && launchctl kickstart -k gui/$(id -u)/com.conductor.todo-hotkey`). Create a test calendar event 3 minutes out on a mapped account, then wait for sync (or run `bash cron/calendar-sync.sh` on the tower). Check each item:
  - The overlay appears ~2 min before, on every screen, with no title or company name.
  - The count ticks down.
  - Typing letters does nothing. Return does nothing.
  - `esc` closes it and focus goes back to the prior app.
  - Snooze brings it back after ~1 min.
  - Point `~/.conductor/url` at a dead port and restart: no crash, no overlay. Restore the URL and it recovers within 60s.

- [ ] **Step 4: Commit** — `git commit -m "feat(todo-app): full-screen title-free meeting alert"`

### Task 5: ⌃⌥M today panel

**Files:**
- Create: `mac/todo-app/MeetingPanel.swift`
- Modify: `mac/todo-app/main.swift:506-529` — `registerHotKey()` registers a second key, `kVK_ANSI_M` with `controlKey | optionKey` and `EventHotKeyID(signature: 0x434E4454, id: 2)`. The handler reads the id with `GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), …)` and routes `1` → `showWindow()`, `2` → `togglePanel()`.

**Interfaces:**
- Consumes: `MeetingWatcher.schedule.upcoming(now:)`, `refresh()` (Task 4).
- Produces: `AppDelegate.togglePanel()`.

- [ ] **Step 1: Implement `MeetingPanel`** — a floating, centered window like the mockup's Today board: a header with "Today", the date (`EEE, MMM d`), and "⌃⌥M". Each row has `startTime` (12-hour), the company color dot, the title, and `company · N min`. The first upcoming row is highlighted (`#2A2A26`) with an `in N min` pill (`#D4785A` bg, `#141413` text). The row is hidden once `endsAt` passes. When there are no rows: "No more meetings today." `esc` or ⌃⌥M again closes it. On open, render the cached list, then `await refresh()` and re-render.

- [ ] **Step 2: Verify manually** — rebuild and kickstart. Check each item:
  - ⌃⌥M opens the list. ⌃⌥M again closes it. `esc` closes it.
  - ⌃⌥Space still opens capture.
  - Past meetings are not listed. The next meeting has the pill.

- [ ] **Step 3: Commit** — `git commit -m "feat(todo-app): ⌃⌥M today's meetings panel"`

### Task 6: Retire the web alert + docs

**Files:**
- Modify: `src/components/AppShell.tsx:12,130-131` — drop the import and `<MeetingAlert />`. Keep `src/components/MeetingAlert.tsx`.
- Modify: `src/app/(app)/settings/SettingsPage.tsx:13,245-246,~1296-1318` — remove the "In-app meeting alert" lead-time row and its state and import.
- Modify: `src/lib/alert-lock.ts:4-6` comment — MeetingAlert is unmounted and the Mac app owns meeting alerts.
- Modify: `CLAUDE.md` — the "Alert layer" section (meeting alert moved to Todo.app on 2026-11-19), the quick-reference table row for ⌃⌥M, and in the Spotlight section a "Meeting alert" subsection (endpoint, 2-min lead, title-free, ⌃⌥M, kickstart after rebuild).

- [ ] **Step 1: Make the edits above.**
- [ ] **Step 2: Verify** — `npx tsc --noEmit` and `npm test` are green. `grep -rn "<MeetingAlert" src` returns nothing.
- [ ] **Step 3: Commit** — `git commit -m "refactor: retire web meeting alert in favor of Todo.app"`

### Task 7: Install on the MacBook Pro

- [ ] **Step 1:** Rebuild the tower container (`docker compose up -d --build`) so the endpoint is live over Tailscale.
- [ ] **Step 2:** On the MacBook, check `~/.conductor/url` = `http://joshuas-mac-pro.tail842fd4.ts.net:5402` and that `~/.conductor/capture-token` exists. Then `git pull && bash mac/build-capture-app.sh && bash mac/install-hotkey.sh && launchctl kickstart -k gui/$(id -u)/com.conductor.todo-hotkey`.
- [ ] **Step 3: Verify** — ⌃⌥M on the MacBook lists today's real meetings, and the next real meeting alerts 2 minutes out.
