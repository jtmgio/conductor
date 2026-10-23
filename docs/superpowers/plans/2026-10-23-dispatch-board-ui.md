# Dispatch Board UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Today page show the dispatch board (the same seven-line cut Claude Code shows), with the existing task drawer for full editing and an owner switch for hand-off.

**Architecture:** A session-authed `GET /api/board` runs the same Prisma query shape as the MCP `get_board` and feeds the pure `buildBoard()`; a new `DispatchBoard` client component renders it and reuses `TaskDetailDrawer` with the Board page's handlers. `FocusPage` swaps `TodayCockpit` for `AgendaStrip` + `DispatchBoard` on desktop; phone is untouched.

**Tech Stack:** Next.js 14 App Router, React, Framer Motion, Lucide, Tailwind + CSS variables, Prisma 5, NextAuth session.

**Spec:** the chat design approved 2026-10-23 (summarised in Global Constraints) and `docs/superpowers/specs/2026-10-22-dispatch-board-design.md` §2 for the board semantics.

## Global Constraints

- Today (`/`) on desktop = meetings strip + board. Phone keeps `MobileCapture`.
- Board rows: tick on the left; key chip; company color dot; title; due date if any; project chip; urgent mark. Seven rows by default; a **more** link when `more: true`; **no number anywhere**, no "N hidden", no badge.
- Sections below the board, each rendered only when non-empty, in this order: **Stuck** (with why: blocked N days / past due / idle N days), **Waiting on** (follow-ups: waiting on *person* for *title*, N days), **In review**.
- Toggles at the top: Today · Week · All (`horizon`) and Mine · Claude · All (`owner`). Default today, mine.
- Ticking a row sets `done: true`, removes it from the DOM with a Framer Motion slide-out, and it never comes back. No completed section.
- Clicking a row opens `TaskDetailDrawer` (unchanged editing) plus a new **Owner** row with Me / Claude buttons styled like its Status buttons.
- The UI never passes `markSeen`; `lastBoardAt` is a Claude Code concern.
- `PUT /api/tasks/:id` accepts `owner` and rejects anything but `"me" | "claude"` with 400.
- Use `@/lib/prisma`, shadcn/Lucide, CSS variables (`var(--text-tertiary)` etc.), no `console.log`. Conventional Commits, no AI attribution, no `Co-Authored-By`, no `Claude-Session` trailer.
- `TodayCockpit.tsx` stays in the repo (unused after this); don't delete it in this plan.
- Lint has 25 pre-existing errors; the set must not grow.

## Review Focus

1. **Tick then refresh.** A ticked task must not reappear on the next fetch. Pinned by the live check in Task 4 (tick, reload, gone).
2. **"More" shows the rest without a number.** Pinned by Task 4's live check and by reading `DispatchBoard.tsx` for any count rendering.
3. **Owner switch persists.** Flip to Claude in the drawer, reload: row is gone from "Mine", present under "Claude". Pinned in Task 4.
4. **Blocked / in-review never on the board.** They come only in their sections. Guaranteed by `buildBoard` (unit-tested); Task 4 eyeballs a blocked task's placement.
5. **Phone unchanged.** `lg:hidden` branch still renders `MobileCapture`. Pinned by Task 3's diff (that branch untouched) and a narrow-window check in Task 4.

---

### Task 1: `GET /api/board` and `owner` on the task PUT

**Files:**
- Create: `src/app/api/board/route.ts`
- Modify: `src/app/api/tasks/[id]/route.ts:14-21` (add `owner`)

**Interfaces:**
- Consumes: `buildBoard`, `viewFlags`, `BoardTask`, `BoardFollowUp`, `Horizon`, `OwnerFilter` from `src/lib/board.ts`; `today`, `formatDateOnly` from `src/lib/dates.ts`; the `OPEN_TASK` shape `{ done: false, status: { not: "icebox" } }` (copy the literal; it isn't exported from the MCP route).
- Produces: `GET /api/board?horizon=today|week|all&owner=me|claude|all` (both optional). Response:
  ```ts
  {
    date: string;                       // YYYY-MM-DD
    board: UiBoardTask[]; more: boolean;
    stuck: (UiBoardTask & { reason: "blocked" | "pastDue" | "idle"; days: number | null })[];
    waitingOnReview: UiBoardTask[];
    waitingOn: { id: string; title: string; waitingOn: string; role: string; roleColor: string; daysWaiting: number }[];
  }
  ```
  `UiBoardTask` = everything `DrawerTask` needs (`id, title, priority, status, roleId, notes, dueDate, checklist, scheduledFor, tags, number, externalKey, role {id,name,color,taskPrefix}`) plus `owner`, `project: { name } | null`, `blockedReason`. Dates as `YYYY-MM-DD` strings via `formatDateOnly`.

- [ ] **Step 1: Write the route**

Session check like `src/app/api/tasks/board/route.ts`. Parse `horizon`/`owner` with a whitelist; anything else → 400. Query open tasks with `role: { active: true }`, include `role {id,name,color,taskPrefix,priority}`, `tags { include: { tag: true } }`, `project { select: { name } }`; query follow-ups `status: "waiting"` with `role {name,color}`. Map each task to `BoardTask & UiBoardTask` (`key` from `taskKey`, `rolePriority: role.priority`, timestamps via `toISOString()`, dates via `formatDateOnly`). `const { capped } = viewFlags({ horizon, owner })`; `buildBoard(rows, followUps, formatDateOnly(today())!, { horizon: horizon ?? "today", owner: owner ?? "me", capped }, now)`. Return the shape above (strip `rolePriority`/`updatedAt`/`createdAt` is optional; leaving them is fine).

- [ ] **Step 2: `PUT /api/tasks/[id]` accepts `owner`**

After the `priority` line: `if (body.owner !== undefined) { if (body.owner !== "me" && body.owner !== "claude") return 400 { error: 'owner must be "me" or "claude"' }; data.owner = body.owner; }`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/board/route.ts 'src/app/api/tasks/[id]/route.ts'
git commit -m "feat(api): board endpoint for the app, owner on task update"
```

---

### Task 2: Owner switch in the task drawer

**Files:**
- Modify: `src/components/TaskDetailDrawer.tsx:34-48` (`DrawerTask`), and the Status block (~line 228) to add an Owner block after it

**Interfaces:**
- Produces: `DrawerTask.owner?: string`. An **Owner** block: label `Owner` (same `text-[11px] uppercase tracking-wider` style), two pill buttons `Me` and `Claude`, selected one filled (reuse the Status button styling with `var(--surface)`/`var(--text-primary)` for selected), `onClick={() => onUpdate(task.id, { owner: "me" | "claude" })}`. `task.owner ?? "me"` is selected.

- [ ] **Step 1: Add the field and the block**

- [ ] **Step 2: Type-check; confirm the Board page still compiles with `owner` undefined**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/TaskDetailDrawer.tsx
git commit -m "feat(drawer): owner switch for hand-off"
```

---

### Task 3: `DispatchBoard` and the Today swap

**Files:**
- Create: `src/components/DispatchBoard.tsx`
- Modify: `src/app/(app)/FocusPage.tsx` (desktop branch only)

**Interfaces:**
- Consumes: `GET /api/board` (Task 1), `TaskDetailDrawer` + `DrawerTask` (Task 2), `TaskKeyChip`, `AgendaStrip`, `useToast`, `cn`, Lucide `Check`, `FolderKanban`, `Flame` (urgent), `Loader2`.
- Produces: `export function DispatchBoard()` — no props.

- [ ] **Step 1: Write `DispatchBoard.tsx`**

State: `horizon` (`"today"|"week"|"all"`), `owner` (`"me"|"claude"|"all"`), `expanded: boolean`, `data`, `loading`, `drawerTaskId`. Fetch `/api/board?horizon=…&owner=…` on mount and whenever the toggles change; **when `expanded` is true and the toggles are at their defaults, fetch with `horizon=today` explicitly** (that lifts the cap — see `viewFlags`) so "more" shows the rest. Reset `expanded` when a toggle changes.

Layout, top to bottom:
- Toggle row: two segmented controls (buttons styled like the drawer's Status pills).
- Board list: `AnimatePresence` + `motion.div` rows with `exit={{ opacity: 0, x: 60, scale: 0.97 }}` (the cockpit's exit). Row content left→right: tick button (`Check` icon, 44px target), `TaskKeyChip`, a 6px dot in `role.color`, title, `Flame` when `priority === "urgent"`, project chip (copy the `FolderKanban` chip from `BoardPage.tsx:546-551`), due date right-aligned in `text-[var(--text-tertiary)]`. Clicking anywhere but the tick sets `drawerTaskId`.
- Under the list: a text button **more** when `data.more && !expanded`. Nothing else, no number.
- Sections `Stuck`, `Waiting on`, `In review`: section label in the `text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]` style; same row component; stuck rows append `blocked N days` / `past due` / `idle N days`; waiting rows read `waiting on {waitingOn} for {title} · N days`. Each section renders only when non-empty.
- Empty board with nothing in any section: one quiet line, "Nothing needs you right now." No counts.
- `TaskDetailDrawer` at the bottom with handlers adapted from `BoardPage.tsx:95-175`: `updateTask` (PUT, merge result into whichever list holds the id), `changeStatus` (PUT status; then refetch — the task may move sections), `completeTask` (remove from every list first, then PUT `done: true`, refetch on failure), `deleteTask` (DELETE, remove). `onUpdate` with `owner` also refetches (the row may leave "Mine").

- [ ] **Step 2: Swap it into `FocusPage.tsx`**

Desktop branch becomes `<AgendaStrip /><DispatchBoard />` inside a `max-w-3xl mx-auto px-6 py-6 space-y-6` container (match the cockpit's page padding — read `TodayCockpit.tsx` for its outer wrapper and copy the values). Remove the `TodayCockpit` import; keep `useSchedule` for the mobile branch.

- [ ] **Step 3: Type-check, lint delta, tests**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -c "error" ; npm test`
Expected: tsc clean; the lint error count is 25 (unchanged); 65 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/DispatchBoard.tsx 'src/app/(app)/FocusPage.tsx'
git commit -m "feat(today): the dispatch board replaces the focus cockpit"
```

---

### Task 4: Deploy and check in the browser

**Files:** none.

- [ ] **Step 1: Deploy**

Run: `cd ~/projects/jtmg/conductor && docker compose up -d --build && docker compose logs conductor | tail -3`
Expected: `✓ Ready`.

- [ ] **Step 2: Live check (controller, in Chrome, logged in at http://localhost:5402)**

- Today shows the meetings strip, the toggles, and seven rows; VQ-298 first; a **more** link; no number anywhere on the page.
- Click **more**: the rest of today's list appears; the link is gone.
- Create a scratch task via MCP (`create_task { role: "Conductor", text: "scratch: ui e2e", refine: false, priority: "urgent" }`), reload: it's on the board. Tick it: it slides out. Reload: gone. Delete it by id afterwards (it's done, so `delete_task`).
- Create another scratch urgent task; click its row; the drawer opens with the Owner row; click **Claude**; close; reload: not under Mine; switch to **Claude**: present. Delete by id.
- Find a blocked task (VQ-279 is blocked 14 days): it's under **Stuck** with "blocked 14 days", not in the board.
- Narrow the window below 1024px: the phone capture view shows, not the board.

- [ ] **Step 3: Push**

`git push` (conductor only).
