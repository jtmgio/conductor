# Spec — End-of-Day Planning (4:45pm)

## Goal

Plan tomorrow's task list at 4:45pm today so the evening is free of planning anxiety. The whole feature exists to deliver one cognitive moment: *"Tomorrow is set, I can stop thinking about it."*

## Why this isn't a small change

Two assumptions baked into the current app break:
1. `Task.isToday: Boolean` is a date-agnostic flag. Pre-planning needs a date.
2. `/api/tasks/reset-today` wipes `isToday` on first load of each day. Pre-set selections would be erased before the user sees them.

The fix is a schema change plus a new trigger; the picker UI is mostly reuse.

## Decisions

### Schema

- **Drop `Task.isToday`**, add `Task.scheduledFor: DateTime?` (a date, not a boolean).
- Add `UserProfile.lastPlannedFor: DateTime?` — the date the user has explicitly finished planning. Source of truth for "have I planned tomorrow yet."
- `Task.status` is untouched. It remains the workflow field (`backlog | in_progress | in_review | done | icebox`). Scheduling and workflow are independent dimensions.

### Authorship of `scheduledFor`

Inherently date-bound work is auto-scheduled. Date-agnostic work goes to backlog and is selected manually.

| Source | Writes `scheduledFor`? |
|---|---|
| Calendar prep tasks | Yes — to the meeting's date |
| Linear sync | No — backlog only |
| Granola sync | No — backlog only |
| Manual entry | No — user selects at 4:45pm or in morning picker |
| In-progress carry-forward | Pre-checked in picker, written on submit |

When a calendar event moves dates, calendar reconciliation must update the prep task's `scheduledFor` to the new meeting date.

### Focus view query

```
scheduledFor <= today AND done = false
```

Yesterday's incomplete tasks naturally carry forward. The reset job is no longer needed for `isToday` — it can be removed once the migration completes. (The Monday icebox thaw stays.)

### Trigger

Three channels, single source of truth (`lastPlannedFor`). All three short-circuit if `lastPlannedFor >= tomorrow`.

1. **macOS LaunchAgent** (`com.conductor.eod-planning.plist`) fires at 4:45pm — opens the app. Mirrors the calendar-sync LaunchAgent pattern.
2. **In-app prompt** — takes over once the app is open.
3. **Browser notification** — fallback for "Mac on, app closed, browser open."

Accepted failure mode: laptop closed at 4:45pm = no prompt fires. User plans in the morning via the fallback path.

### Snooze

- One re-fire at +30 min after first prompt.
- After the second miss, drop silently. Morning picker handles the next day.
- No third nag.

### Sick / non-working day

- "Skip today" affordance on the prompt suppresses for 24 hours.
- (Future) Auto-suppress when `Task.isToday` count was 0 today and no Linear/Granola activity — system can tell you didn't work.

### Submit semantics

- Picker writes `scheduledFor` on each check (implicit save — never lose work).
- `lastPlannedFor` is set **only** when user taps **Done**. Closing the tab mid-plan = "not planned" — prompt re-fires per snooze rule.
- The "Done" button is the cognitive-closure ritual. Don't auto-set `lastPlannedFor`.

### Picker UI

Reuse the existing morning picker shell (`FocusView.tsx:499-513`). Group by role.

Add for the 4:45pm version:
- Header: "Plan **Wednesday**" (target date), with read-only "Wednesday at a glance" — meeting count, hours blocked.
- Pre-check `status=in_progress` tasks (auto-roll forward by default).
- Pre-check anything already `scheduledFor=tomorrow` from calendar sync.
- Visual distinction on auto-checked items (muted style + small icon: `📅` calendar, `⏳` in-progress). The user must be able to tell at a glance whether a check came from them or the system.
- Submit writes `scheduledFor=tomorrow` for checked items, sets `UserProfile.lastPlannedFor=tomorrow`.

The existing morning picker uses the **same component** with:
- Target date = today
- Header "Plan today"
- Same pre-check logic, same submit handler, same AI review

### Morning picker as fallback

```
On AppShell first-load-of-day:
  if UserProfile.lastPlannedFor < today:
    show picker, target = today
  else:
    skip — already planned
```

Plus a manual "Plan day" button (in Focus header) — opens the picker any time, for any target date. Covers "I want to swap two tasks Wednesday morning" and "I forgot to plan, let me catch up at noon."

### AI involvement

**Reuse `/api/ai/review-today`** — it already does 80% of the AI work. Extend it with:
- `targetDate` parameter (defaults to today)
- `candidateTaskIds` parameter (evaluate provisional selections, not just `isToday=true`)
- Hours calculation reads `dayAssignments[String(targetDayOfWeek)]`

Called from the picker when user taps a "Review" button before "Done." Returns the existing JSON: `verdict | per-task assessment | suggested deferrals`.

**The boundary:** AI sorts, summarizes, and warns. It **never** auto-selects, auto-deselects, or blocks submission. The user is the authority. Paternalistic AI would defeat the "in control" axis of the design.

`/api/ai/briefing` is unaffected and unused by this feature.

### Weekend rule

- **Friday 4:45pm:** plans Monday. (Skips Saturday since you don't work weekends.)
- **Sunday 4:45pm:** amend-only. Surfaces *only* if calendar sync added new Monday meetings since Friday, or user opens it manually. Does **not** trigger a fresh prompt.
- `lastPlannedFor=Monday` is set Friday and is not re-set Sunday.
- Auto-suppress for Sat/Sun (no schedule blocks for those days).

## Out of scope

- Email / SMS notifications for the laptop-closed case.
- Auto-suppression based on activity heuristics (sick day detection).
- Multi-day-ahead planning UI (Tuesday planning Friday). Possible later — `scheduledFor` already supports it.
- Any change to `/api/ai/briefing`.

## Implementation order

1. **Schema migration**
   - Add `Task.scheduledFor: DateTime?`. Backfill: `scheduledFor = today WHERE isToday = true`.
   - Add `UserProfile.lastPlannedFor: DateTime?`.
   - Update Focus view query and all `isToday` reads (~23 files per grep). Drop `isToday` after callsites are migrated.
2. **Extend `/api/ai/review-today`**
   - Accept `targetDate` and `candidateTaskIds`.
   - Hours calculation reads target day's `dayAssignments`.
3. **Extend the morning picker**
   - Accept a `targetDate` prop.
   - Pre-check logic: `status=in_progress` tasks + items with `scheduledFor=targetDate` already.
   - Visual distinction for auto-checked.
   - Submit writes `scheduledFor`, sets `lastPlannedFor` only on explicit "Done."
4. **AppShell changes**
   - Conditional fallback: show picker on first-load-of-day if `lastPlannedFor < today`.
   - "Plan day" button in Focus header.
5. **Calendar sync write**
   - Update `/api/calendar/process` to write `scheduledFor=meeting date` on prep task creation.
   - Update reconciliation: when meeting moves dates, update prep task's `scheduledFor`.
6. **4:45pm trigger**
   - macOS LaunchAgent (`cron/com.conductor.eod-planning.plist`, mirror calendar-sync plist).
   - In-app prompt component (modal or hard banner).
   - Browser Web Push registration + service worker.
   - All three check `lastPlannedFor` server-side before firing the UI.
7. **Snooze + skip**
   - "Plan now / Snooze 30m / Skip today" affordances on the prompt.
   - Snooze state stored client-side (re-fire once); skip stored as `lastPlannedFor=tomorrow` with a `skippedAt` flag, or a separate `planningSkippedFor` field.
8. **Friday/Sunday rule**
   - LaunchAgent schedule: 4:45pm Mon–Fri (Friday targets Monday).
   - Sunday: amend-only path triggered manually or by calendar-sync diff.

## Open content question

Notification copy. Candidates:
- "Plan tomorrow" — neutral
- "Set Wednesday up so you can stop thinking about it" — narrative, anxiety-reducing
- "What's tomorrow look like?" — soft

Pick before shipping. Default: the second — it states the value explicitly.
