# Dispatch Board + Home Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Josh one cross-company board (`get_board`) cut to his next seven things, a task owner (`me` | `claude`), a "what changed since I looked" list, and a home folder whose only job is that board.

**Architecture:** One pure, unit-tested library (`src/lib/board.ts`, `buildBoard()`) holds the ordering, the cut, the stuck rules and the changes diff, sharing `sectionFor` with the walk. The MCP route wires it to Prisma the way `get_today_walk` is wired. Rules reach sessions through the server `instructions`, a new `dispatch` skill in the home folder, and the owner line added to the boilerplate skills.

**Tech Stack:** Next.js 14 App Router, Prisma 5 / Postgres 16, `mcp-handler` 1.1.0, Zod, Vitest 3.2.4.

**Spec:** `docs/superpowers/specs/2026-10-22-dispatch-board-design.md`

## Global Constraints

- `Task.owner` is `"me" | "claude"`, default `"me"`. Hand-off is `update_task { owner: "claude" }` and touches nothing else.
- `get_board` default view: every active company, `owner = me`, horizon `today` (urgent, past due, due/planned today), capped at `BOARD_CAP = 7`, `more: true` when cut. **No number anywhere.**
- A widened view (`horizon`, `role`, `project`, or `owner` set) is uncapped.
- `board` excludes blocked and `in_review` tasks. A task is in one list only.
- `stuck` ignores the `owner` filter: blocked 3+ days (or `blockedAt` null), or `owner = claude` and past due, or `owner = claude` and `updatedAt` 3+ days old.
- `waitingOn` = follow-ups with status `waiting` whose `staleDays` has passed.
- `lastBoardAt` is stamped only when `markSeen: true`. `changes` is omitted when `lastBoardAt` is null. Done tasks are never in `changes`.
- Order inside a section: `dueDate` soonest first, none last; then `rolePriority`; then `createdAt`.
- Server `instructions` ≤ 300 words (test enforces). Home alone drops the firewall, by `CLAUDE.md` marker.
- Role priority reorder (Zeta, vQuip, HealthMe, Healthmap, Xenegrade, then the rest) is a data change done with Josh present. **Stop and ask before running it.**
- Use `@/lib/prisma`. No `console.log`. Conventional Commits, no AI attribution, no `Co-Authored-By`, no `Claude-Session` trailer.
- Working tree is clean at start (checked). Nothing unrelated to stage around.

## Review Focus

1. **First catch-up after install.** `lastBoardAt` null must yield no `changes` key, not the whole history. Pinned in Task 2 (`omits changes when nothing was ever seen`).
2. **An urgent task handed to Claude.** Default view hides it (owner filter), but if it slips past due it must come back in `stuck`. Pinned in Task 2 (`a claude task that is past due is stuck, not on the board`).
3. **Day boundary on `lastBoardAt`.** `nowPastDue` compares a date to the day of a UTC instant; that day must be Eastern, same as `today()`. Pinned in Task 2 (`dayOf` test).
4. **A hand-off with no due date.** Must resurface after 3 idle days. Pinned in Task 2 (`a claude task untouched for three days is stuck`).
5. **The cap never shows a number.** Response has `more: boolean` and no count field. Pinned in Task 2 (`caps the default view at seven with more:true and no count`).

---

### Task 1: Schema — `Task.owner`, `UserProfile.lastBoardAt`

**Files:**
- Modify: `prisma/schema.prisma` (`Task` ~line 85, `UserProfile` ~line 11)
- Create: `prisma/migrations/20261022180000_add_task_owner/migration.sql`

**Interfaces:**
- Produces: `Task.owner String @default("me")` with doc comment `/// Who does this: "me" (only Josh) or "claude" (a Claude Code session can run it).` and `UserProfile.lastBoardAt DateTime?` with `// last time the home board was marked seen (UTC instant)`.

- [ ] **Step 1: Add the two fields to `prisma/schema.prisma`**

Place `owner` after `notBefore` on `Task`; `lastBoardAt` after `lastRolloverOn` on `UserProfile`.

- [ ] **Step 2: Write the migration by hand**

```sql
-- Who does a task: Josh ("me") or a Claude Code session ("claude").
ALTER TABLE "Task" ADD COLUMN "owner" TEXT NOT NULL DEFAULT 'me';
-- When the home board was last marked seen; drives "catch me up".
ALTER TABLE "UserProfile" ADD COLUMN "lastBoardAt" TIMESTAMP(3);
```

- [ ] **Step 3: Verify the migration matches the schema**

Run: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script` (or, if no shadow URL is set: `npx prisma migrate diff --from-schema-datamodel <(git show HEAD:prisma/schema.prisma) --to-schema-datamodel prisma/schema.prisma --script`)
Expected: the same two `ALTER TABLE` statements and nothing else.

- [ ] **Step 4: Regenerate the client and type-check**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261022180000_add_task_owner
git commit -m "feat(schema): task owner and last board read"
```

---

### Task 2: `buildBoard` pure library and `dayOf`

**Files:**
- Modify: `src/lib/today-walk.ts` (export `sectionFor`, `BLOCKED_CHECK_IN_DAYS`, `addDaysYmd`)
- Modify: `src/lib/dates.ts` (add `dayOf`)
- Create: `src/lib/board.ts`
- Test: `src/lib/__tests__/board.test.ts`, `src/lib/__tests__/dates.test.ts` (append)

**Interfaces:**
- Consumes: `WalkTask`, `sectionFor(t, today, weekEnd)`, `WALK_SECTIONS` from `today-walk.ts`.
- Produces, in `src/lib/dates.ts`:
  - `dayOf(d: Date): string` — the `YYYY-MM-DD` of that instant in `TIMEZONE`, same formatter `today()` uses. Refactor `today()` to call it.
- Produces, in `src/lib/board.ts`:
  ```ts
  export interface BoardTask extends WalkTask {
    owner: "me" | "claude";
    role: string;
    rolePriority: number;
    updatedAt: string; // ISO timestamp
  }
  export interface BoardFollowUp { id: string; title: string; waitingOn: string; role: string; createdAt: string; staleDays: number }
  export type Horizon = "today" | "week" | "all";
  export type OwnerFilter = "me" | "claude" | "all";
  export interface BoardOptions { horizon: Horizon; owner: OwnerFilter; capped: boolean }
  export type StuckReason = "blocked" | "pastDue" | "idle";
  export interface Board<T extends BoardTask> {
    board: T[];
    more: boolean;
    stuck: (T & { reason: StuckReason; days: number | null })[];
    waitingOnReview: T[];
    waitingOn: (BoardFollowUp & { daysWaiting: number })[];
    changes?: { new: T[]; nowPastDue: T[]; nowStuck: T[] };
  }
  export const BOARD_CAP = 7;
  export const CLAUDE_IDLE_DAYS = 3;
  export function buildBoard<T extends BoardTask>(
    tasks: T[], followUps: BoardFollowUp[], today: string, opts: BoardOptions,
    now?: Date, lastSeen?: { at: string; day: string } | null,
  ): Board<T>
  ```
  Semantics: skip `notBefore > today`. Blocked → `stuck(blocked)` if days ≥ 3 or `blockedAt` null, else dropped. `in_review` → `waitingOnReview`. `owner = claude` and past due → `stuck(pastDue)`; `owner = claude` and `now - updatedAt ≥ 3 days` → `stuck(idle)`. Everything left: apply `opts.owner`, then `sectionFor`; `today` keeps `urgent | pastDue | today`, `week` adds `thisWeek`, `all` keeps every section. Sort by section order, then `dueDate`, `rolePriority`, `createdAt`. `capped` → first 7, `more` = any cut. `changes` only when `lastSeen` given.

- [ ] **Step 1: Write the failing `dayOf` test (append to `dates.test.ts`)**

```ts
it("dayOf gives the Eastern calendar day of an instant", () => {
  process.env.TIMEZONE = "America/New_York";
  expect(dayOf(new Date("2026-10-23T02:30:00Z"))).toBe("2026-10-22");
});
```
Note: `TIMEZONE` is read at module load (`const TIMEZONE = getTimezone()`), so set `process.env.TIMEZONE` before importing, or import `dates.ts` dynamically inside the test with `vi.resetModules()`.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/__tests__/dates.test.ts`
Expected: FAIL — `dayOf` is not exported.

- [ ] **Step 3: Implement `dayOf` and make `today()` use it**

- [ ] **Step 4: Run it**

Run: `npx vitest run src/lib/__tests__/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Export `sectionFor`, `BLOCKED_CHECK_IN_DAYS`, `addDaysYmd` from `today-walk.ts`**

Run: `npx vitest run src/lib/__tests__/today-walk.test.ts`
Expected: 16 pass, unchanged.

- [ ] **Step 6: Write the failing board tests**

Use a `t()` factory like `today-walk.test.ts` with defaults `owner: "me"`, `role: "vQuip"`, `rolePriority: 1`, `updatedAt: "2026-10-22T12:00:00Z"`. `TODAY = "2026-10-22"`, `NOW = new Date("2026-10-22T15:00:00Z")`, `DEFAULT = { horizon: "today", owner: "me", capped: true }`.

```ts
it("default view shows only my tasks due today or sooner, urgent first", ...)
  // urgent (no date), pastDue 10-20, today, thisWeek 10-25, loose → board keys = [urgent, pastDue, today]
it("sorts inside a section by due date, then company priority, then age", ...)
  // two pastDue same date: rolePriority 2 then 1 → 1 first
it("caps the default view at seven with more:true and no count", ...)
  // 9 today tasks → board.length 7, more true, expect(Object.keys(result)).not.toContain("count")
it("does not cap a widened view", ...)
  // 9 today tasks, { ...DEFAULT, horizon: "week" } → 9, more false
it("week adds the next seven days; all adds everything", ...)
it("hides claude-owned tasks from the default view", ...)
it("owner:claude shows only claude tasks; owner:all shows both", ...)
it("a claude task that is past due is stuck, not on the board", ...)
  // owner claude, dueDate 10-20, opts owner all → stuck [{reason:"pastDue"}], board []
it("a claude task untouched for three days is stuck", ...)
  // updatedAt 2026-10-19T14:00:00Z → stuck reason "idle", days 3
it("a claude task updated yesterday is not stuck", ...)
it("stuck ignores the owner filter", ...)
  // owner me, blocked 4 days, opts owner claude → in stuck
it("blocked under three days is dropped; three or more, or no blockedAt, is stuck", ...)
it("in_review goes to waitingOnReview and nowhere else", ...)
it("a task in stuck is not on the board", ...)
it("hides tasks whose notBefore is in the future", ...)
it("lists follow-ups whose staleDays have passed, with daysWaiting", ...)
  // createdAt 10-18, staleDays 3 → listed, daysWaiting 4; createdAt 10-21 staleDays 3 → not listed
it("omits changes when nothing was ever seen", ...)
  // lastSeen null → expect(result).not.toHaveProperty("changes")
it("changes.new is everything created since last seen, any owner", ...)
it("changes.nowPastDue is what slipped since last seen", ...)
  // lastSeen { at: "2026-10-20T13:00:00Z", day: "2026-10-20" }; dueDate 10-21 → in; dueDate 10-15 → out
it("changes.nowStuck is blocked or in_review since last seen", ...)
```

- [ ] **Step 7: Run them**

Run: `npx vitest run src/lib/__tests__/board.test.ts`
Expected: FAIL — cannot resolve `@/lib/board`.

- [ ] **Step 8: Implement `src/lib/board.ts`**

Reuse `sectionFor` and `addDaysYmd`. Past-due check is the same expression `buildWalk` uses. Days are `Math.floor((now - t) / 86_400_000)`.

- [ ] **Step 9: Run the suite**

Run: `npm test`
Expected: all pass (37 existing + the new ones).

- [ ] **Step 10: Commit**

```bash
git add src/lib/board.ts src/lib/today-walk.ts src/lib/dates.ts src/lib/__tests__/board.test.ts src/lib/__tests__/dates.test.ts
git commit -m "feat(board): cross-company board ordering, cut, stuck and changes"
```

---

### Task 3: MCP — `get_board`, `owner` on tasks, `markSeen`

**Files:**
- Modify: `src/app/api/mcp/[transport]/route.ts` (`taskShape` ~116, `create_task` ~480, `update_task` ~568, after `get_today_walk` ~305)

**Interfaces:**
- Consumes: `buildBoard`, `BOARD_CAP`, types from Task 2; `dayOf` from `dates.ts`.
- Produces: tool `get_board` with inputSchema
  ```ts
  horizon: z.enum(["today","week","all"]).optional()   // default today
  owner:   z.enum(["me","claude","all"]).optional()     // default me
  role:    z.string().trim().min(1).optional()
  project: z.string().trim().min(1).optional()          // needs role
  markSeen: z.boolean().optional()                      // default false
  ```
  Response: `{ date, board, more, stuck, waitingOnReview, waitingOn, changes? }`. `taskShape` gains `owner`. `create_task` and `update_task` gain `owner: z.enum(["me","claude"]).optional()`.

- [ ] **Step 1: `taskShape` returns `owner`**

Add `owner: string` to its parameter type and `owner: t.owner` after `priority`. Every walk entry now carries `owner` for free.

- [ ] **Step 2: `create_task` takes `owner`**

Pass `owner: owner ?? "me"` in `prisma.task.create`. Description: `'"me" (default) if only Josh can do it, "claude" if a Claude Code session can run it. Propose it when filing.'`

- [ ] **Step 3: `update_task` takes `owner`**

`if (owner !== undefined) data.owner = owner;`. Description: `'Hand-off: "claude" means a session can run it. Changes nothing else.'`

- [ ] **Step 4: Register `get_board`**

Description: `"The dispatch board. Only from the home folder (its CLAUDE.md says it is the dispatcher). Call with no arguments for 'what's up': Josh's tasks across every company, urgent first then by date, cut to the next seven. Call with markSeen:true for 'catch me up' and read only changes and stuck. horizon/owner/role/project widen it and lift the cap. Never report counts."`

Query: `prisma.task.findMany({ where: { ...OPEN_TASK, ...(role ? { roleId } : {}), ...(project ? { projectId } : {}) }, include: { role: { select: { name, taskPrefix, priority } }, project: { select: { name } } } })` plus `prisma.followUp.findMany({ where: { status: "waiting" }, include: { role: { select: { name } } } })` plus `prisma.userProfile.findUnique({ where: { id: "default" }, select: { lastBoardAt: true } })`. Map tasks to `BoardTask` the way `get_today_walk` maps rows (dates via `formatDateOnly`, timestamps via `toISOString()`), with `rolePriority: t.role.priority`, `owner: t.owner as "me" | "claude"`, `updatedAt`. `capped = !horizon && !owner && !role && !project`. `lastSeen = lastBoardAt ? { at: lastBoardAt.toISOString(), day: dayOf(lastBoardAt) } : null`. If `markSeen`, `prisma.userProfile.update({ where: { id: "default" }, data: { lastBoardAt: new Date() } })` after computing. `project` without `role` throws `"project filter needs role"` (same as `list_tasks`).

- [ ] **Step 5: `get_today_walk` description says where it belongs**

Prepend `"In a company window: "` to its description.

- [ ] **Step 6: Type-check and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/api/mcp/[transport]/route.ts'
git commit -m "feat(mcp): get_board tool and task owner"
```

---

### Task 4: Server instructions and repo CLAUDE.md

**Files:**
- Modify: `src/lib/mcp-instructions.ts`
- Modify: `src/lib/__tests__/mcp-instructions.test.ts`
- Modify: `CLAUDE.md` (MCP section, ~line 610)

- [ ] **Step 1: Write the failing instruction tests**

```ts
it("names the board and the owner field", () => {
  for (const term of ["get_board", "owner"]) expect(CONDUCTOR_MCP_INSTRUCTIONS).toContain(term);
});
it("drops the firewall only in the home folder", () => {
  expect(CONDUCTOR_MCP_INSTRUCTIONS).toMatch(/home folder/i);
  expect(CONDUCTOR_MCP_INSTRUCTIONS).not.toMatch(/no company role has no firewall/);
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/lib/__tests__/mcp-instructions.test.ts`
Expected: the two new tests FAIL.

- [ ] **Step 3: Add two lines to the instructions, trim to stay ≤ 300 words**

Add after the firewall line:
```
- Home: only the home folder (its CLAUDE.md says it is the dispatcher) has no firewall. There, call get_board for "what's up" and get_board with markSeen for "catch me up".
```
Add after the projects lines:
```
- Owner: owner is "me" (only Josh can do it) or "claude" (a session can run it). Propose it when filing; Josh flips it.
```
If the word count passes 300, shorten the projects-hold-context line.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: all pass, including the 300-word cap.

- [ ] **Step 5: Update `CLAUDE.md`**

In the MCP section: add `get_board` to the tool list; one bullet for `Task.owner` and hand-off; one bullet for `get_board` (`buildBoard()` in `src/lib/board.ts`, the cut, `stuck`, `markSeen`/`lastBoardAt`); one bullet naming the home folder `~/projects/jtmg/home` as the only firewall-free session. Point at the spec.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp-instructions.ts src/lib/__tests__/mcp-instructions.test.ts CLAUDE.md
git commit -m "docs(mcp): board and owner rules in server instructions"
```

---

### Task 5: The home folder

**Files:**
- Create: `~/projects/jtmg/home/CLAUDE.md`
- Create: `~/projects/jtmg/home/.claude/skills/dispatch/SKILL.md`
- Create: `~/projects/jtmg/home/.gitignore` (`local/`)
- Create: `~/projects/jtmg/home/README.md` (three lines: what this is, open it with `claude`, say "what's up")

**Interfaces:**
- Consumes: `get_board` from Task 3, exactly as described there.

- [ ] **Step 1: `git init` the folder**

Run: `mkdir -p ~/projects/jtmg/home/.claude/skills/dispatch && git -C ~/projects/jtmg/home init -q -b main`

- [ ] **Step 2: Write `CLAUDE.md`**

Must contain, in this order: the marker line `**This folder is the home dispatcher. It has no company.**`; "Use the `dispatch` skill here, not `conductor`. The one-company firewall is for company folders; it does not apply here."; the five moves as a table (what's up → `get_board()`, read `board`; catch me up → `get_board({ markSeen: true })`, read `changes` and `stuck`, "nothing new" if both empty; give X to a session → `update_task { taskId, owner: "claude" }` then "X is marked for a session. Open the <company> window."; add a <company> task → `create_task { role, text }`, say which company it landed in; this week / everything for X / the Y project / Claude's tasks → `get_board` with `horizon` / `role` / `project` / `owner`); "Seven lines at a time. Offer 'more' without a number. Never a count."; "Never work a task here. Code, messages, and files belong in that company's window."; company order for reference: Zeta, vQuip, HealthMe, Healthmap, Xenegrade.

- [ ] **Step 3: Write `dispatch/SKILL.md`**

Frontmatter `name: dispatch`, description: `The home board — "what's up", "catch me up", "give VQ-298 to a session", "add a Zeta task", "this week", "everything for HealthMe". Use only in the home folder. Reads across every company; never works a task.` Body: the five moves with one line each on how to read the result (a board line is `key · company · title · date if any`; a stuck line adds why: blocked N days / past due / idle N days; `waitingOn` lines are "waiting on <person> for <title>, N days"). State: `more: true` → end with "more?"; `changes` empty and `stuck` empty → "nothing new."

- [ ] **Step 4: Commit**

```bash
git -C ~/projects/jtmg/home add -A
git -C ~/projects/jtmg/home commit -m "feat: home dispatcher folder"
```

---

### Task 6: Boilerplate skills carry the owner

**Files:**
- Modify: `~/projects/jtmg/command-center-boilerplate/.claude/skills/conductor/SKILL.md` (walk step 2; the Reading list)
- Modify: `~/projects/jtmg/command-center-boilerplate/.claude/skills/log-meeting/SKILL.md` (line 63, the conductor row)
- Run: `~/projects/jtmg/command-center-boilerplate/tooling/sync-conductor-skills.sh`

- [ ] **Step 1: `conductor` skill**

Walk step 2 gains: "Each entry has `owner`. `claude` → this is the session's own work: do it. `me` → ask before starting it." Reading list: `update_task` line adds "`owner` (`claude` hands it to a session)". Add one line under Norms: "Propose `owner` on every task you file: `claude` when a session could run it alone, `me` otherwise."

- [ ] **Step 2: `log-meeting` skill**

Line 63: after "show each proposed task with its project", add "and its owner (`me` / `claude`)".

- [ ] **Step 3: Sync and commit in all three repos**

Run: `~/projects/jtmg/command-center-boilerplate/tooling/sync-conductor-skills.sh`
Expected: both targets show `M .claude/skills/conductor/SKILL.md` and `M .claude/skills/log-meeting/SKILL.md`.

```bash
git -C ~/projects/jtmg/command-center-boilerplate commit -am "feat(conductor): task owner in the walk and when filing"
git -C ~/projects/vquip/engineering/vquip-command-center commit -am "chore(skills): sync conductor skills (task owner)"
git -C ~/projects/react-health/react-health-command-center commit -am "chore(skills): sync conductor skills (task owner)"
```

---

### Task 7: Deploy, reorder companies, end-to-end

**Files:** none new.

- [ ] **Step 1: Deploy**

Run: `cd ~/projects/jtmg/conductor && docker compose up -d --build && docker compose logs conductor | tail -5`
Expected: entrypoint applies `20261022180000_add_task_owner`; `✓ Ready`.

- [ ] **Step 2: Verify the columns live**

Run: `docker exec postgres psql "postgresql://conductor:localdev@localhost:5432/conductor" -tAc "select column_name, column_default from information_schema.columns where (table_name='Task' and column_name='owner') or (table_name='UserProfile' and column_name='lastBoardAt')"`
Expected: `owner|'me'::text` and `lastBoardAt|` (two rows).

- [ ] **Step 3: STOP — ask Josh before the priority reorder**

It's a data change. Show him the SQL, run only on his yes:
```sql
UPDATE "Role" SET priority = CASE name
  WHEN 'Zeta Global' THEN 1 WHEN 'vQuip' THEN 2 WHEN 'HealthMe' THEN 3
  WHEN 'Healthmap Solutions' THEN 4 WHEN 'Xenegrade' THEN 5
  WHEN 'Wris' THEN 6 WHEN 'TrainBetter.coach' THEN 7 WHEN 'React Health' THEN 8
  WHEN 'Conductor' THEN 9 WHEN 'Personal' THEN 10 END;
```
Expected: `UPDATE 10`; `select name, priority from "Role" order by priority` shows Zeta first.

- [ ] **Step 4: Live `get_board` from this session**

Call `mcp__conductor__get_board` with `{}`.
Expected: `board` has ≤ 7 entries, every entry `owner: "me"`, no blocked or in_review status, `more` is a boolean, no key named `count`. `changes` absent (never marked seen).

- [ ] **Step 5: Live hand-off round trip**

`create_task { role: "Conductor", text: "scratch: board e2e", refine: false }` → `update_task { taskId, owner: "claude" }` → `get_board {}` does not list it → `get_board { owner: "claude", role: "Conductor" }` lists it → `get_board { markSeen: true }` returns `changes.new` containing it → `delete_task` by **id** (not key).

- [ ] **Step 6: Headless e2e in home**

Run: `cd ~/projects/jtmg/home && claude -p "what's up" 2>&1 | tail -20`
Expected: output opens with a task line (key · company · title), at most seven lines, no number of hidden tasks, and the transcript shows `get_board` with no arguments.

Run: `cd ~/projects/jtmg/home && claude -p "catch me up" 2>&1 | tail -10`
Expected: `get_board` called with `markSeen: true`; output is "nothing new" or only changed/stuck items.

- [ ] **Step 7: Push**

```bash
git -C ~/projects/jtmg/conductor push
git -C ~/projects/jtmg/command-center-boilerplate push
git -C ~/projects/vquip/engineering/vquip-command-center push
git -C ~/projects/react-health/react-health-command-center push
```
The home repo has no remote yet; creating one is Josh's call. Ask.
