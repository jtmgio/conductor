# Conductor v2 — Full Implementation Spec

**Status:** approved direction, ready to execute
**Companion doc:** `docs/REDESIGN_BRIEF.md` (visual/design source of truth — this doc is the engineering source of truth)
**Audience:** an implementing agent (Claude Opus) working in this repo with full context of `CLAUDE.md`

---

## Decisions locked (2026-07-22, after code audit — see `CURRENT_VS_V2.md`)

**Deletions (user-confirmed, informed by the audit of what each page actually contains):**
- **Cut `/ai` entirely** — the whole chat page: per-role chat, artifacts, image analysis, **and the slash-command generators** (`/standup-prep` etc.). User does AI work in Claude Code + command centers; slash commands are not used. Delete `ChatThread`, `ThreadSidebar`, `DraftVariants`, `/api/conversations/*`, `/api/skills/*`, `skill-resolver.ts`; `Skill`/`Conversation` models stay in DB (additive rule).
- **Cut `/documents` (notes)** — notes live in the user's command-center apps. Delete `NoteEditor`, `DocumentViewer`, notes/documents pages + API. `Note` model stays in DB; AI context assembly degrades gracefully without pinned notes.
- **Cut `/drafts` + `/docs`** — formatter→clipboard replaces the drafts queue; CLAUDE.md replaces in-app help. Delete pages, `/api/drafts/*`, `docs-content.ts`.
- **Cut ALL of meetings** — the history page AND `MeetingPrepPanel` (user never used the manual prep/extract flow; per-meeting depth lives in command-center apps now). Delete `/meetings`, `MeetingPrepPanel`, the manual calendar-screenshot upload UI, and `/api/ai/meeting-prep`.

**Why cutting the meeting-prep panel loses nothing real:**
- The **Granola hourly sync stays** and *already* auto-extracts tasks/follow-ups from meeting transcripts in the background — the panel was just a redundant manual version of that. `Transcript` model, Granola sync, and `/api/ai/extract` (also used by Granola/calendar sync) all stay.
- **Meeting alerts / the takeover stay** — sourced from calendar sync + `AgendaStrip`, not the panel. The 15-min in-app alert should no longer open a panel; drop that behavior (the takeover + corner banner are the alert now). Any prep note shown comes from the calendar prep task, not the panel.
- Removing the panel also removes its embedded `ChatThread`/`NoteEditor`/`DocumentViewer` dependencies cleanly — no slimming refactor needed.

**Formatter survives the `/ai` cut** — it lives in `format-message.ts`, invoked from ⌘K GlobalSearch and the MCP tool, independent of the chat page. Becomes its own `/formatter` page (§7.5).

**Other locked calls:**
- **Priority:** no P1/P2/P3, no ranking. Keep the existing binary urgent flag **AI-set only, and hide the red "URGENT" label** — urgent just biases the one-thing order, invisibly. User never sets priority.
- **Refine:** make it **async** — capture lands verbatim instantly, refine updates the card a few seconds later; if company was ambiguous, a quiet "which company?" chip appears on the card afterward (never a blocking spinner/modal).
- **Rollover (fully specced, user-confirmed 2026-07-22):**
  - Keep today's silent unschedule-to-backlog (no overdue, no red), but **add a breadcrumb** so a carried-over task is distinguishable from a never-scheduled one. Implementation: on the daily reset, when an undone task's `scheduledFor` is cleared, record that it was carried over — e.g. a `carriedOverAt DateTime?` (or preserve `lastScheduledFor`). Additive migration.
  - **Resurface in-context, per company:** when the user enters a company's block, show a small "N unfinished from before" affordance at the top of that company's tasks (NOT a global pile, NOT a morning digest). Query: `roleId == current && done == false && scheduledFor == null && carriedOverAt != null`.
  - **One-tap triage per item: today / push a day / drop.** *Today* → set `scheduledFor = today`, clear `carriedOverAt` (it re-enters the one-thing flow). *Push a day* → set `scheduledFor = next working day` (resurfaces then). *Drop* → `status = "icebox"` (out of the active flow, still searchable), clear `carriedOverAt`. Making this micro-decision is the load-bearing behavioral mechanism (Zeigarnik release / implementation intention).
  - **No auto-fade:** items keep gently resurfacing until acted on. This is safe *because* "drop" is one tap — nothing rots silently in backlog (graveyard fear) and nothing nags against the user's will.
  - **No planning ritual — just-in-time only.** Day prep is NOT a step. Therefore **remove `EodPlanningPrompt` and `MorningPick`/`MorningBriefing` planning flows entirely** (supersedes the earlier "retime EOD to 3:45" note — the prompt is deleted, not retimed). The global `lastPlannedFor` gate is no longer used for prompting. Getting tasks onto "today" happens via: entering a block (one-thing flow pulls that company's tasks), the carry-over triage, and quick capture — no dedicated planning screen.
- **Completion:** add a brief **undo** on complete (mitigates "did I check the wrong one?" anxiety).
- **Mobile capture (user-confirmed 2026-07-22):**
  - **Floating + button** in the thumb zone (bottom-right), on every screen. Mount a proper FAB in the mobile shell (the existing `QuickEntry` FAB isn't mounted — wire a real one).
  - **Prominent voice.** A large mic in the capture sheet: tap → speak → transcribe → file. Prefer native keyboard dictation on iOS Safari (Web Speech API is flaky in the iOS PWA); a big mic that focuses the field + invites dictation is the reliable path. Design it as the primary affordance, not a tiny icon.
  - **Fire-and-forget + undo** — no confirm step on mobile. Capture posts verbatim immediately → toast "Filed to {company} · undo". Async refine + company inference update the task afterward (same pipeline as MCP `create_task`). Chosen over "stop if unsure": even when company inference is uncertain, do NOT block — file to the **current block's company** as best guess and rely on the undo chip / later recategorize. Lowest friction wins on mobile.
  - **Extra doors: Siri voice-shortcut + home-screen widget**, both via iOS Shortcuts → the **existing MCP endpoint** (`/api/mcp`, reachable over Tailscale). No new backend — the Shortcut POSTs raw text to `create_task`, which already refines + infers company. NOT building: share-sheet-from-other-apps, offline queue (user deprioritized both).
  - **Known risk (deferred, user-deprioritized):** with no offline queue, a fire-and-forget capture on no signal (subway) can fail silently. Acceptable for now; revisit if it bites — a small local queue + retry is the fix.

---

## 0. Why (do not skip — this shapes every decision)

The user holds 7 concurrent engineering jobs (4 active: vQuip, Zeta, Healthmap, HealthMe; 2 automated: Wris, Xen; 1 dormant: React Health; 1 personal project: TrainBetter). He is neurodivergent and operates on fear/anxiety: he compulsively checks Slack/Teams across all companies (~every 5 minutes) driven by a feeling of being "behind" or "in trouble" — a feeling with no external evidence (no one expects instant responses; deliverables are flexible).

**Conductor v2's single job: replace the anxiety patrol with visible facts.**

Three mechanisms, all specced below:
1. **Comms cover** — a visible "checking is handled, next sweep at HH:MM" signal that grants permission NOT to check, plus a sweep ritual at block transitions (~7×/day instead of ~96×/day).
2. **All-clear** — explicit per-company safety facts ("nothing due, no one waiting") replacing the mental audit.
3. **Block transition ritual** — a full-screen 20-second reset between company blocks: park open thoughts, sweep comms, see the next block's ONE task.

Per-project depth (meeting prep, docs, intel) now lives in per-project "command center" apps outside Conductor. Conductor slims to a cockpit: **Today · Board · Tracker · Formatter · Settings**.

### Non-negotiable UX rules (unchanged from v1, enforced everywhere)
- No badge counts, no numbers on nav, ever.
- Completed tasks animate out and are GONE. No completed views, totals, streaks.
- Follow-ups ≠ tasks. Separate surfaces.
- One company at a time; others appear only as calm all-clear facts.
- No guilt mechanics. Stale follow-ups get one quiet amber dot (the app's only proactive alert). Sweep-due state is amber, never red, never a modal nag.
- The "anti-badge": where other apps alarm, Conductor states safety explicitly.
- Dark theme primary; CSS variables (`var(--surface)`, `var(--text-primary)`, etc.); Framer Motion animations; Lucide icons; shadcn/ui primitives; 44px touch targets.

---

## 1. Scope summary

### BUILD (new)
| Item | Section |
|---|---|
| Comms-cover system (model fields, API, UI strip) | §3 |
| Block-transition ritual (detection + full-screen component) | §4 |
| All-clear computation + API + UI line | §5 |
| Quick capture on Today (AI role inference) | §6 |
| Today screen (rebuilt Focus page per design) | §7.1 |
| Formatter as first-class page `/formatter` | §7.5 |
| Nav slim-down (5 items) | §7.6 |

### KEEP (unchanged or lightly touched)
- All sync plumbing: Linear sync, Granola sync (task/follow-up extraction continues; only the transcript *viewer* dies), Calendar/EventKit sync + AgendaStrip, cron sidecar, LaunchAgents.
- MCP server (`src/app/api/mcp/`) — all 8 tools.
- `MedicationReminders` + `/api/reminders` (just shipped).
- `EodPlanningPrompt` — but retime from 4:45pm to **3:45pm** (schedule now ends 3:45; see §8.4).
- Board, Inbox, Tracker pages (restyle in design pass, logic unchanged).
- Settings 4-tab structure + embedded flow/keys/costs content.
- Auth, setup wizard, export/import, GlobalSearch (⌘K), theming, task refine (`src/lib/task-refine.ts`), `format-message` lib + route.
- All Prisma models — **no destructive schema migration in v2**. Orphaned models (Conversation, Transcript, Note-as-chat, Skill) stay in the DB; prune in a later cleanup once v2 is stable.

### DELETE (§8)
Pages: `/ai`, `/documents`, `/docs`, `/drafts`, `/meetings` (agenda strip on Today covers it).
Components: ChatThread, ThreadSidebar, DocumentViewer, DraftVariants, MeetingPrepPanel, MorningBriefing, RoleTabs (chat-related), NoteEditor (if only used by cut pages — verify imports first).
Hooks: `useCheckInTimer` (replaced by comms cover), `useTaskChat`.
API routes: `/api/conversations/*`, `/api/documents/*`, `/api/drafts/*`, `/api/skills/*` (skills existed for chat slash commands), `/api/transcripts/*` **viewer endpoints only** — keep any route the Granola sync writes through.
AppShell: the 30-min check-in modal + `useCheckInTimer` wiring (`src/components/AppShell.tsx` lines ~137–145 and the modal at ~177–239).

**Deletion protocol:** before deleting any file, `grep -r` its imports. Anything imported by a KEEP surface gets untangled first. Delete in a dedicated commit separate from feature commits.

---

## 2. Data model changes (Prisma)

Additive only. One migration: `add_comms_cover`.

```prisma
model UserProfile {
  // ... existing fields ...
  lastSweepAt DateTime?   // last completed comms sweep (UTC instant)
}

model SweepLog {
  id        String   @id @default(cuid())
  sweptAt   DateTime @default(now())
  blockId   String?  // ScheduleBlock id the sweep closed out (null = manual sweep)
  createdAt DateTime @default(now())
}
```

`SweepLog` is append-only history (lets us later answer "did the protocol hold this week" — for the user's own curiosity only, never surfaced as a score). `UserProfile.lastSweepAt` is the fast-path read.

**Migration gotcha (documented in repo history):** `prisma migrate` from the host fails with P1010 against the shared `postgres` container. Apply via `docker exec -i postgres psql -U conductor -d conductor` + manually insert the `_prisma_migrations` row (checksum = sha256 of migration.sql) — exactly as done for `20260720100000_add_reminders`. Or run `migrate deploy` inside the app container.

---

## 3. Comms-cover system

### 3.1 Concept
The user's 30-min check-in modal failed (he ignored it and checked every 5 min anyway). Inversion: he doesn't need a reminder to check — he needs **permission not to check**. A persistent strip shows that checking is scheduled and covered. Sweeps happen at block transitions (~hourly, 9:00–3:45 → ≤7/day), keeping worst-case response latency ~1 hour (inside async-work norms).

### 3.2 API — `GET /api/comms-cover`
Auth: NextAuth session (same pattern as `/api/reminders`).

Logic:
1. Load schedule via existing `getScheduleBlocks()` + `rebalanceBlocks()` (same as `/api/schedule` — extract shared helper rather than duplicating).
2. Compute today's **block boundaries** (each block's end time) in local tz (`localNow()` from `src/lib/schedule.ts`).
3. `lastSweepAt` from UserProfile.
4. `nextSweepAt` = the first boundary after `max(lastSweepAt, startOfWorkday)`. If none remain today → `null` (day is done).
5. `dueNow` = a boundary exists that is ≤ now AND > lastSweepAt (i.e., a transition passed without a sweep).

Response:
```json
{
  "lastSweepAt": "2026-07-21T13:30:00Z",
  "nextSweepAt": "2026-07-21T14:30:00Z",
  "dueNow": false,
  "offClock": false
}
```
`offClock: true` outside working hours/weekends → UI hides the strip entirely.

### 3.3 API — `POST /api/comms-cover/sweep`
Body: `{ blockId?: string }`. Sets `UserProfile.lastSweepAt = now`, inserts `SweepLog` row. Returns fresh comms-cover state.

### 3.4 UI — `CommsCoverStrip` component
Mounted on Today (primary) and as a compact line in the Sidebar (so it's visible on every page).

States:
- **Covered** (default): `✓ Comms covered · next sweep in 22 min (10:30)` — `--text-tertiary`, check icon, completely calm. Countdown updates client-side every 30s from `nextSweepAt` (no per-second ticking — a racing timer creates urgency).
- **Due** (`dueNow`): `Sweep comms — 5 min` — amber (same amber family as MedicationReminders: `text-amber-300`, `bg-amber-500/15`). A button, not a modal. Clicking opens the sweep panel (§3.5). Plays `playSound("checkin")` ONCE on transition to due (reuse the `prevDueRef` newly-due pattern from `MedicationReminders.tsx`).
- **Off-clock**: hidden.

Poll `GET /api/comms-cover` every 60s (piggyback the existing AppShell schedule-poll cadence).

### 3.5 UI — sweep panel
A bottom-sheet / centered card (not full-screen — that's the transition ritual's job):
- Title: "Comms sweep" · subtitle: "Glance, reply-or-flag, come back. ~5 min."
- One row per **active company with a platform** (from `/api/roles`): color dot, name, platform label (Slack/Teams), a check toggle.
- Checking all rows enables "Done" → `POST /api/comms-cover/sweep` → strip returns to Covered with the new next time.
- "Skip this one" is allowed per-row (unchecked rows don't block Done — the ritual must never feel like a test). Done just requires the button press.

### 3.6 Retire the old check-in
- Remove `useCheckInTimer` usage + the check-in modal from `AppShell.tsx`.
- Delete `src/hooks/useCheckInTimer.ts`.
- Clean up its localStorage keys opportunistically (`conductor-checkin-*`) — one-time sweep in AppShell mount effect, then remove that code in a later release.

---

## 4. Block-transition ritual

### 4.1 Detection
Client-side in AppShell. The schedule poll already returns `currentBlock` every 60s. Keep `prevBlockIdRef`; when `currentBlock.id` changes from one non-null value to another (or from null→value at day start), and localStorage `conductor-transition-seen` ≠ that block id, show the ritual and store the id. Per-device is fine (localStorage), matching existing daily-reset pattern.

Edge cases:
- Mid-block app open (e.g. first open at 10:47): do NOT show the ritual — only show on an observed change or if `dueNow` sweep is pending from a boundary in the last 15 min.
- Rebalanced schedules (`rebalanceBlocks` merges/skips blocks): the id comparison handles it — any id change is a transition.

### 4.2 UI — `BlockTransition` component (full-screen takeover, z-index above everything but med reminders)
Sequential, one screen, four zones, spring animations (Framer Motion, match existing damping/stiffness values ~24/320):

1. **Closure** — "vQuip block complete." Previous role's color, large. NO summary of tasks done/undone (rule 2 & 6).
2. **Park** — "Anything open in your head?" — one textarea. On submit each line goes through quick-capture (§6) → filed as backlog tasks with AI role inference. Empty is fine; skippable.
3. **Sweep** — embedded sweep panel (§3.5). Completing it here counts as the sweep (POST with `blockId`).
4. **Next up** — "Zeta · 10:30–11:30" in Zeta's color + THE one next task (top task for that role, `isToday` first then priority order). Single button: **"Start Zeta"** → dismiss, play `playSound("transition")`.

Escape/click-out dismisses without completing (never trap him) — but the strip will show sweep-due until he sweeps.

---

## 5. All-clear system

### 5.1 API — `GET /api/all-clear`
For each active role EXCEPT the current block's role, compute **facts**:
- `dueToday`: count of tasks `done: false` with `dueDate` = today (local tz via `today()` in `src/lib/dates.ts`).
- `staleFollowups`: count of FollowUps `status: active` older than the stale threshold (reuse the existing tracker stale logic — find it in the tracker page/`FollowUpCard` and extract to a shared lib function; do not invent a second threshold).
- `quiet` = both are 0.

Response:
```json
{ "roles": [
  { "id": "...", "name": "vQuip", "color": "#...", "quiet": true },
  { "id": "...", "name": "Healthmap", "color": "#...", "quiet": false, "dueToday": 1, "staleFollowups": 0 }
]}
```
Omit the numeric fields entirely when `quiet: true` (the payload itself shouldn't tempt the UI to show counts).

### 5.2 UI — `AllClearLine`
One row on Today, under the comms strip. Per non-current company: `{name} ✓ quiet` in that company's color at low opacity. Non-quiet: `{name} · 1 due today` — stated as a fact in normal text weight, amber dot only if it's a stale follow-up. Clicking a company jumps to Board (tasks) or Tracker (follow-ups) filtered to it.

**Integrity rule:** this line must never lie. If the API errors, render nothing — a false "quiet" destroys the trust that makes the whole mechanism work. No cached/stale rendering beyond the poll interval (60s).

---

## 6. Quick capture

Input on Today ("dump a thought…") + global hotkey (add `key: "n", modifiers: ["cmd"]` to AppShell shortcuts → focuses the input; if not on Today, opens a small overlay version).

Submit → `POST /api/tasks` with the existing refine pipeline (`src/lib/task-refine.ts`, same path the MCP `create_task` uses): AI infers the company with evidence verification. Behavior on `needsClarification`: do NOT block with a modal — file to the **current block's role** and show a 5-second undo chip: "Filed to Zeta · change?" (tap → role picker). The exit ramp must stay 3 seconds; the fear of losing the thought is the reason he context-switches.

New tasks: backlog, not today (existing default). The capture input clears instantly on submit (optimistic).

---

## 7. Screens

### 7.1 Today (`/` — rebuild of FocusView per REDESIGN_BRIEF Screen 1)
Zones top→bottom: current-block header (company color, time range, subtle block progress) → ONE next task large card (rest of that company's today-tasks collapsed below) → CommsCoverStrip → AllClearLine → AgendaStrip (existing component, keep) → quick capture. MedicationReminders banner continues to float bottom-center.

Existing pieces to reuse from FocusView: task fetching, complete-animation (slide-out + gone), priority-waterfall block resolution. `MorningPick` (optional morning selection) stays — rule 5, it's optional.

### 7.2 Board (`/board`) — unchanged logic, restyle only. Default filter = current block's company.
### 7.3 Inbox (`/inbox`) — keep as-is (task triage; feeds Board).
### 7.4 Tracker (`/tracker`) — unchanged logic; add "Nudge" action → routes to `/formatter` prefilled with a draft ("following up on {what}"), company preselected.
### 7.5 Formatter (`/formatter` — NEW page)
Extract the formatter from wherever it currently lives into a standalone page: textarea (raw draft) + company picker + platform picker (defaults from the chosen company's platform) → calls existing `/api/ai/format-message` → renders result **exactly as returned** (Slack = mrkdwn as-is), Copy button pinned above the preview (recent fix — keep that behavior), recent-formats list below (localStorage, last 10). Reuse `useFormatMessage` hook.
### 7.6 Navigation
Sidebar/BottomNav/MobileDrawer → 5 items: Today, Board, Tracker, Formatter, Settings. Update keyboard shortcuts in AppShell: ⌘1 Today, ⌘2 Board, ⌘3 Tracker, ⌘4 Formatter, ⌘, Settings. Remove ⌘5/6/7 (ai/documents/drafts). Keep ⌘K search, ⌘[ sidebar, ⌘N capture (new), ? shortcuts.
Inbox: reachable from Board (tab or link), drops out of primary nav.

### 7.7 Settings — structure unchanged. Add **Reminders manager** to System tab: list/add/edit/deactivate Reminder rows (label, time, weekday picker) → needs `POST/PATCH` handlers added to `/api/reminders` (GET exists). Add **Comms** subsection: nothing configurable in v2 beyond on/off; sweeps are tied to block boundaries by design (configurable cadence would reopen the negotiation-with-anxiety loop).

---

## 8. Deletion plan (exact)

### 8.1 Pages (directories under `src/app/`)
`ai/`, `documents/`, `docs/`, `drafts/`, `meetings/`.
Keep: `flow/`, `keys/`, `costs/` (embedded in Settings), `inbox/` (linked from Board).

### 8.2 API routes (directories under `src/app/api/`)
Delete: `conversations/`, `documents/`, `drafts/`, `skills/`.
Audit before deleting: `notes/` (keep if Tracker/roles use notes; the Note *model* stays regardless), `transcripts/` (keep any endpoint the Granola sync calls — check `src/app/api/integrations/granola/sync/route.ts` imports first), `files/` (keep — uploads may back setup/import), `context/` (was for artifacts — delete if only ChatThread consumed it; grep first), `ai/` subroutes (KEEP `format-message`; delete chat/draft/extract-chat endpoints not used by sync or MCP — `ai/extract` is used by Granola/calendar paths, KEEP).

### 8.3 Components / hooks / libs
Delete components: `ChatThread`, `ThreadSidebar`, `DocumentViewer`, `DraftVariants`, `MeetingPrepPanel`, `MorningBriefing`, `RoleTabs`, `NoteEditor` (grep-verify), `ConfirmExtract` (grep-verify — may be used by inbox processor, keep if so).
Delete hooks: `useCheckInTimer`, `useTaskChat`.
Keep libs even if orphaned by cuts: `skill-resolver.ts` and `docs-content.ts` can be deleted if nothing imports them post-cut; `ai-context.ts` — KEEP, MCP + format-message + refine use context assembly.
`GlobalSearch`: remove result types for deleted surfaces (conversations, documents) — grep its source for them.

### 8.4 Adjustments to keepers
- `EodPlanningPrompt`: fire at **3:45pm** (new schedule end), not 4:45.
- `AppShell`: remove check-in wiring/modal; add transition detection (§4.1), CommsCoverStrip mount, ⌘N.
- `Sidebar`/`BottomNav`/`MobileDrawer`: new nav set + compact comms line in Sidebar.

---

## 9. Build phases (each = one PR-sized commit set, app boots green after each)

**Phase 1 — Backend foundations.** Prisma migration (§2, using the documented in-container/psql method), `/api/comms-cover` + `sweep`, `/api/all-clear`, `/api/reminders` POST/PATCH. Unit-testable pure logic (boundary computation) extracted into `src/lib/comms-cover.ts`.
**Phase 2 — Comms UI.** CommsCoverStrip + sweep panel + retire check-in modal/hook. App fully usable here even if nothing else ships.
**Phase 3 — Transition ritual.** Detection + BlockTransition component + park-thoughts capture (§6 pipeline).
**Phase 4 — Today rebuild + AllClearLine + quick capture.** Per design mockups from claude.ai/design.
**Phase 5 — Formatter page + nav slim + shortcut remap.**
**Phase 6 — Deletions (§8) in an isolated commit.** Grep-audit → delete → build → fix imports → build green.
**Phase 7 — Restyle Board/Inbox/Tracker/Settings to the new design language.**

After each phase: `npx tsc --noEmit`, `docker compose up -d --build`, verify container logs show Ready, click through affected surfaces.

## 10. Acceptance criteria (the whole point — verify against these, not just "it renders")

1. On any page, the user can see within 1 second when the next comms sweep is — without opening Slack.
2. A passed block boundary flips the strip to sweep-due (amber) with one chime, no modal.
3. Completing a sweep (panel or ritual) resets the strip; state survives app restart and device switch (DB-backed).
4. Block change while app open → full-screen ritual: closure → park → sweep → next block's one task. Escape never traps.
5. A thought typed in quick capture lands as a refined backlog task in ≤3s perceived (optimistic clear), correct company or current-block fallback with visible undo.
6. All-clear line shows only truthful facts; API failure renders nothing rather than stale "quiet."
7. Zero counts anywhere in nav or Today. Zero "overdue" red states. Completed tasks vanish.
8. `/ai`, `/documents`, `/docs`, `/drafts`, `/meetings` return 404; Linear/Granola/Calendar syncs still run green (check `docker compose logs conductor-cron` + a manual `bash cron/calendar-sync.sh`).
9. MCP server unaffected: `get_context`, `create_task`, `format_message` still work from an external session.
10. Reminders (vitamins 9:45 M–F, TRT 9:50 M/F) still fire and are manageable in Settings.

## 11. Out of scope for v2 (do not build)

- Configurable sweep cadence, sweep streaks/stats surfaces, any gamification.
- Migrating orphaned Prisma models/data (Conversation, Transcript, Skill) — later cleanup.
- Per-project command-center integration (separate apps by design).
- Push/OS-level notifications, macOS Focus-mode automation (a candidate v3: fire an Apple Shortcut on block transitions — noted, not now).
- Multi-user anything, time tracking, weekly summaries.
