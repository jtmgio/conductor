# Current app vs. Conductor v2 — gap analysis

Grounded in a code audit of the live app (2026-07-22). For each area: what the app does **today**, what we've **designed** in the v2 prototype/spec, the **delta**, and the **decision**.

---

## 1. The Today / Focus screen — the biggest UX shift

**Today:** `FocusView` shows a **mini-kanban board (default view)** of *all* the current role's tasks, or a reorderable list. Column headers show counts. There's a role countdown badge, a role-transition dialog (`RoleHandoff`), a once-a-day `MorningBriefing` card, an optional `MorningPick` picker, an AI "Review my day" capacity panel, an onboarding checklist, and an off-clock state. Two view modes (list/board), Cmd+L toggles. **No "one thing" concept anywhere.**

**Designed (v2):** One task at a time ("your one thing"), rest collapsed, next promotes on completion, "start next company early," comms strip, all-clear line, agenda, quick-capture.

**Delta:** This is the largest change. We're replacing a counts-heavy kanban with a single-task cockpit. Much of FocusView's machinery (RoleHandoff → our transition ritual; MorningBriefing, Review-my-day, onboarding checklist, board/list modes) has to be consciously kept, cut, or folded in — not silently dropped.

**Decision:** Confirm which FocusView extras survive the rebuild: (a) keep Board as a separate page only, drop board-mode from Today? (b) keep or cut the AI "Review my day" capacity panel? (c) keep MorningBriefing? My lean: Today = pure one-thing cockpit; Board lives at `/board`; drop the capacity panel (it shows hours/counts = anxiety); keep an optional morning briefing.

---

## 2. Task completion & the "one thing"

**Today:** Checkbox → 400ms fill animation + haptic vibrate → task removed from local state (no undo). Board drag-to-Done also completes. No single-next-task; you pick from the board/list.

**Designed:** Same satisfying slide-away, but the **next task auto-promotes** into the hero slot. That promotion is new.

**Delta:** Small mechanically (completion already animates + disappears), but the promotion + single-hero presentation is the new part. **No undo today** — worth adding a brief undo on completion for the anxiety case ("did I just check the wrong thing?").

**Decision:** Add undo-on-complete? (Recommend yes — cheap, reduces a real anxiety.)

---

## 3. Task entry + AI refine

**Today:** `TaskBrainDump` is the AI-refine surface (inside list-view "Add task" only). Flow: type → **blocking** "Refining…" spinner (local MLX, up to **120s** timeout) → editable preview (title/notes/checklist/**urgent toggle**/due) → "Create task" (separate POST). Refine produces title + notes + checklist + dueDate (+ role only via MCP). Graceful fallback to raw text on failure. `QuickEntry` (bare-`n` hotkey) does **raw add, no refine** — and **isn't even mounted in the app shell**. No Cmd+N. No mobile quick-add. `InboxProcessor` = bulk extraction from transcripts/files.

**Designed:** One-line natural-language capture → AI extracts title/notes/checklist/company/date → "here's what I got, tap to fix" → filed. Same pipeline for ⌘N, mobile +, and MCP. Async (never block).

**Delta:**
- **Refine is blocking today; we want async.** Real, worth-doing change: capture lands instantly, refine fills in a few seconds later.
- **Company inference is MCP-only today; in-app uses a role dropdown.** Our design brings inference into the app UI (with the "which company?" fallback).
- **Capture surfaces are weak today** (no ⌘N, no mounted FAB, no mobile add). Our one-pipeline/three-doors model is a genuine upgrade.
- The full refine (title+notes+checklist) already exists — the prototype now reflects it.

**Decision:** Async refine — confirm the model: capture verbatim instantly → background refine updates the card → if company was ambiguous, a quiet "which company?" chip appears on the card afterward (not a blocking modal). Recommend yes.

---

## 4. Priority

**Today:** **Binary — `normal` | `urgent`.** AI sets it during refine (urgent only if explicitly time-sensitive/blocking); user can toggle it in the brain-dump preview; urgent renders a **red "URGENT" label** across surfaces; ordering sorts urgent first. (Not P1/P2/P3.)

**Designed:** "No priority system — one thing at a time." (Your locked answer.)

**Delta:** Smaller than I thought — there's no ranking today, just an urgent flag. The real question: **keep the urgent flag or drop it?**

**Decision:** I lean **keep urgent as an AI-set signal, but don't make you set it and don't show a red label** (red = anxiety). Urgent just nudges something toward the top of the one-thing order. You never rank; the flag is invisible pressure-relief, not a badge. Your call.

---

## 5. Rollover + day prep — your sore spot

**Today:** Unfinished tasks at rollover are **silently unscheduled back to backlog** (`scheduledFor → null`) — no overdue, no guilt. **But zero breadcrumb:** a rolled task becomes indistinguishable from a never-scheduled one (no "was due yesterday", `dueDate` is inert in the lifecycle). Reset is client-side, once/day on app open (if you don't open the app, it never runs, and stale tasks still show as "today" due to `<=`). Planning is a **global singleton** (`lastPlannedFor`) via `MorningPick` — one plan-state for the whole app, not per-company. EOD prompt fires **4:45pm** Mon–Fri → hands to the picker (plans next working day).

**Designed:** Undone → backlog (no guilt) **+ a per-company "unfinished from yesterday" resurfacing with a one-tap "when?"** (the Zeigarnik/implementation-intention fix). Per-company, tiny prep. EOD retimed to your 3:45 end.

**Delta:**
- The calm rollover already exists — good.
- **The breadcrumb/resurfacing is missing** — this is the real fix and it's genuinely new. Needs a way to mark "rolled over" (e.g., keep a `lastScheduledFor` or a rolledOver flag) so it can resurface without becoming overdue-red.
- **Per-company prep is new** (today is global).
- Client-side once/day reset is fragile — consider a server-side safety net.

**Decision:** (a) Confirm the resurfacing model — one-tap "today / a day / drop" when you re-enter a company with unfinished items. (b) Per-company prep instead of one global plan? (c) Retime EOD to 3:45.

---

## 6. Meetings & notifications — an interaction we must not break

**Today:** `AgendaStrip` (kept) uses `useMeetingNotifications`: **two** alerts per meeting — a **15-min-before in-app prep alert that auto-opens `MeetingPrepPanel`**, and a **5-min-before OS notification** (needs permission) + chime. Lead times configurable. `MeetingPrepPanel` is a rich 6-tab drawer (AI prep, notes, Granola transcript + task extraction, chat, tasks, files).

**Designed:** Full-screen meeting **takeover** 5 min before (loudest signal) + lingering corner banner.

**Delta / trap:** Our takeover replaces the OS-notification path — good. **But the 15-min in-app alert currently opens `MeetingPrepPanel`, which is on the delete list.** If we cut `/meetings` + `MeetingPrepPanel`, the prep alert has nothing to open, and we lose Granola-transcript-driven prep/extraction. Meeting alerts and the meetings deletion are **coupled** — can't decide them separately.

**Decision:** Keep a lightweight meeting-prep surface (even if `/meetings` history page goes) so the prep alert + Granola extraction survive? Or fold "prep" into the takeover itself?

---

## 7. The deletions are heavier than the plan implied ⚠️ (most important finding)

The spec's cut list (`/ai`, `/documents`, `/drafts`, `/meetings`, `/docs`) removes **real, non-trivial capability** — more than "chat we don't need":

| Page | What's actually lost |
|---|---|
| `/ai` | Per-role **AI chat with threaded memory**, **slash-command skills**, **live artifacts** (HTML/React/Mermaid), **image/file analysis**, task-extraction-from-replies, draft variants |
| `/documents` | **Rich notes editor** (TipTap), **pin-note-to-AI-context**, document library with **download** + AI summaries |
| `/drafts` | The **draft queue** (sink for "save to drafts") |
| `/meetings` | Meeting **history browser**, **manual calendar screenshot upload** (the EC2/no-EventKit fallback), and the **`MeetingPrepPanel`** (Granola transcript → task extraction) |
| `/docs` | The entire **in-app knowledge base** (~35 articles) |

**Two things that make this safe-ish:**
- **The message formatter does NOT live in `/ai`.** It's in `format-message.ts`, invoked from **GlobalSearch (⌘K)** and the **MCP tool** — both independent of the chat page. Cutting `/ai` does **not** cost you the formatter. ✅
- `ChatThread` is **embedded in `MeetingPrepPanel`** — deleting the component (not just the route) also strips the meeting drawer's chat tab. Coupling to watch.

**Decision (the big one):** This isn't "chat we don't need" — it's a real trade. Options:
- **A. Cut aggressively** as planned — accept losing chat/artifacts/notes/meeting-prep/docs to get a lean cockpit. (You *did* confirm this earlier, but before this audit.)
- **B. Cut the pages from nav but keep the capabilities reachable** (e.g., keep notes + meeting-prep, drop the AI chat page + drafts + docs).
- **C. Keep more than planned** — demote to a "More" area rather than delete.

My revised lean after the audit: **cut `/ai` chat, `/drafts`, `/docs` (low daily value for you); but keep notes and a slim meeting-prep** — because meeting prep is coupled to the alert you just said is critical, and notes/pin-to-context feeds the AI you *do* use (capture inference, formatter). Worth a real decision, not a rubber-stamp.

---

## Summary — what actually changes vs. what already exists

**Genuinely new (build):** one-thing cockpit · task auto-promotion · start-next-early · comms-cover sweep (replaces check-in) · all-clear line · block-transition ritual (expands RoleHandoff) · async refine · in-app company inference · ⌘N + mobile capture · per-company prep + rollover resurfacing · full-screen meeting takeover.

**Already exists, keep/adjust:** calm silent rollover (add breadcrumb) · binary urgent flag (hide the red) · full AI refine (title/notes/checklist) · meeting alerts (rewire the prep-open) · AgendaStrip · formatter (survives `/ai` cut) · EOD prompt (retime 3:45).

**Heavier-than-planned to remove:** AI chat/artifacts/skills, notes editor, meeting-prep+Granola-extraction, in-app docs. Decide deliberately.
