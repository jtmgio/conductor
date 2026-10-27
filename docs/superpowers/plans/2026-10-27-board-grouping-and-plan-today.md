# Board Grouping, Filters, and Plan Today Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The expanded board reads company → project with urgent/planned first; the UI filters by company then project; a per-project Claude Code session can "plan today" and the picks land on the board, grouped.

**Architecture:** One pure change in `sectionFor` makes planned tasks rank with urgent everywhere (walk, MCP board, UI). A new MCP tool `plan_today` records picks, with a pure `planClearSet()` deciding what `replace` clears. `GET /api/board` gains `role`/`project` filters and the row's `role.priority`; a pure `groupBoard()` turns the ordered rows into company → project groups for `DispatchBoard`. The overnight rollover is deleted so unfinished picks are asked, not dropped. Instructions, the `conductor` skill, and CLAUDE.md teach sessions the flow.

**Tech Stack:** Next.js 14 App Router, React, Framer Motion, Lucide, Tailwind + CSS variables, Prisma 5, Zod, `mcp-handler`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-board-grouping-and-plan-today-design.md` (approved 2026-10-27).

## Global Constraints

- **Planned ranks with urgent, everywhere.** `scheduledFor = today` lands in the `urgent` section of the walk, the MCP board, and the UI.
- The seven-row default view (`more`) is unchanged. Grouping shows only when expanded or filtered. Picking a company or project implies expanded.
- Company order = `Role.priority`; projects A→Z, loose last; inside a group the server's row order stands (urgent-or-planned, past due, today, this week, rest; then due date).
- Group headers are plain text in the section-label style with the company color dot. **No counts anywhere**, in headers, chips, or responses.
- `plan_today` sets `scheduledFor = today`; `replace: true` clears today's `scheduledFor` only on open tasks in the picks' own project(s) (loose picks clear loose; picks across projects clear each of those), never the whole company; refuses a task outside `role`.
- "At most five" picks per plan is a skill rule, not a server limit.
- With a project filter, Stuck and In review follow it; Waiting on follows the company only. Horizon and owner toggles still apply on top of the filters.
- Filters are by id, persisted in the URL as `?role=…&project=…` (`project=loose` for tasks with none).
- Server instructions stay ≤300 words (`src/lib/__tests__/mcp-instructions.test.ts`). They are at exactly 300 now; adding a line means trimming elsewhere.
- Rollover stops clearing `scheduledFor`; unfinished picks come back as past due ("did this happen?"). UX rule 6 narrows to "no summary, no guilt".
- Use `@/lib/prisma`, shadcn/Lucide, CSS variables, no `console.log`. Conventional Commits, no AI attribution, no `Co-Authored-By`, no `Claude-Session` trailer.
- `npm test` is 65 tests before this plan; lint has 25 pre-existing errors (`npm run lint 2>&1 | grep -ci error`); neither may regress.
- Synced skill copies: after editing the boilerplate `conductor` skill, run `tooling/sync-conductor-skills.sh` in `~/projects/jtmg/command-center-boilerplate` and commit in both targets.

## Review Focus

1. **A planned task whose due date already passed** (`scheduledFor = today`, `dueDate < today`) must sit in `urgent` with `pastDue: true`, so the walk still asks "did this happen?". Test in Task 1.
2. **`replace: true` with picks in project A** must leave project B's planned tasks alone, and leave A's *done* tasks alone. Tests in Task 2.
3. **`project=loose`** on `/api/board` must return only rows with no project, never everything. Live check in Task 7; the where-clause test is by reading in Task 4's review.
4. **A task with `scheduledFor` three days ago**, after rollover removal, must still show as past due the next morning, not vanish. Covered by the existing walk test "pastDue" plus the deleted rollover (Task 3); live check in Task 7.
5. **Group order with a task whose project name sorts before "loose"** — loose must still be last in every company, and a company with only loose tasks still gets a header. Tests in Task 5.

---

### Task 1: Planned ranks with urgent

**Files:**
- Modify: `src/lib/today-walk.ts:49-56` (`sectionFor`)
- Test: `src/lib/__tests__/today-walk.test.ts:65-72`, `src/lib/__tests__/board.test.ts`

**Interfaces:**
- Produces: `sectionFor(t, today, weekEnd)` returns `"urgent"` when `t.priority === "urgent"` **or** `t.scheduledFor === today`. Nothing else about the signature changes. `buildBoard` picks the change up automatically (it imports `sectionFor`).

- [ ] **Step 1: Change the walk test**

Replace "puts tasks due today or planned for today in today" with two tests:

```ts
it("puts tasks due today in today", () => {
  const due = t({ dueDate: TODAY });
  const walk = buildWalk([due], TODAY, NOW);
  expect(sectionOf(walk, due.key)).toBe("today");
  expect(walk.sections.today[0].pastDue).toBe(false);
});

it("planned for today ranks with urgent, and keeps its past-due flag", () => {
  const planned = t({ scheduledFor: TODAY });
  const plannedButLate = t({ scheduledFor: TODAY, dueDate: "2026-10-20" });
  const walk = buildWalk([planned, plannedButLate], TODAY, NOW);
  expect(sectionOf(walk, planned.key)).toBe("urgent");
  expect(sectionOf(walk, plannedButLate.key)).toBe("urgent");
  expect(walk.sections.urgent.find((e) => e.task.key === plannedButLate.key)?.pastDue).toBe(true);
  expect(walk.sections.today).toHaveLength(0);
});
```

Add to `board.test.ts`, next to "default view shows only my tasks due today or sooner, urgent first":

```ts
it("a task planned for today sits with urgent at the top of the board", () => {
  const later = t({ dueDate: TODAY });
  const planned = t({ scheduledFor: TODAY, createdAt: "2026-10-26T00:00:00Z" });
  const board = buildBoard([later, planned], [], TODAY, DEFAULT, NOW);
  expect(board.board[0].key).toBe(planned.key);
});
```

(`t`, `TODAY`, `NOW`, and `DEFAULT` are the file's existing helpers; `TODAY` there is `2026-10-22`.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/__tests__/today-walk.test.ts src/lib/__tests__/board.test.ts`
Expected: the two new walk tests and the new board test FAIL (`"today"` where `"urgent"` is expected).

- [ ] **Step 3: Change `sectionFor`**

First line becomes `if (t.priority === "urgent" || t.scheduledFor === today) return "urgent";`. Drop `|| t.scheduledFor === today` from the `today` line (it is now unreachable). Update the comment on `WalkSection`/`sectionFor` to say planned-today ranks with urgent because Josh chose it this morning.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all pass; the count is 65 + 2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today-walk.ts src/lib/__tests__/today-walk.test.ts src/lib/__tests__/board.test.ts
git commit -m "feat(walk): planned-today tasks rank with urgent"
```

---

### Task 2: `plan_today` tool and `get_today_walk.project`

**Files:**
- Create: `src/lib/plan-today.ts`, `src/lib/__tests__/plan-today.test.ts`
- Modify: `src/app/api/mcp/[transport]/route.ts` (`get_today_walk` at ~263-308; register `plan_today` right after `update_task`)

**Interfaces:**
- Produces, in `src/lib/plan-today.ts`:
  ```ts
  export interface PlanCandidate { id: string; projectId: string | null; done: boolean; scheduledFor: string | null } // YYYY-MM-DD
  /** Ids whose scheduledFor should be cleared before planning: open tasks planned for `today`, in the same project(s) as the picks, not themselves picks. */
  export function planClearSet(picks: PlanCandidate[], candidates: PlanCandidate[], today: string): string[]
  ```
- Produces, MCP: `plan_today({ role: string, taskIds: string[], replace?: boolean })` → `{ date, role, planned: string[] /* keys */, cleared: string[] /* keys */ }`. Keys accepted anywhere an id is (`resolveTaskId`).
- Produces, MCP: `get_today_walk` gains `project?: string` (partial name or id; needs `role`; resolved with `resolveProject(r.id, r.name, project)` — active projects only).

- [ ] **Step 1: Write the failing tests for `planClearSet`**

```ts
import { describe, expect, it } from "vitest";
import { planClearSet, type PlanCandidate } from "@/lib/plan-today";

const TODAY = "2026-10-27";
const c = (id: string, projectId: string | null, extra: Partial<PlanCandidate> = {}): PlanCandidate =>
  ({ id, projectId, done: false, scheduledFor: TODAY, ...extra });

describe("planClearSet", () => {
  it("clears today's other open tasks in the picks' project only", () => {
    const picks = [c("a1", "A")];
    const all = [c("a1", "A"), c("a2", "A"), c("b1", "B"), c("l1", null)];
    expect(planClearSet(picks, all, TODAY)).toEqual(["a2"]);
  });
  it("loose picks clear only loose tasks", () => {
    expect(planClearSet([c("l1", null)], [c("l1", null), c("l2", null), c("a1", "A")], TODAY)).toEqual(["l2"]);
  });
  it("picks spanning two projects clear both, and nothing else", () => {
    const all = [c("a1", "A"), c("a2", "A"), c("b1", "B"), c("b2", "B"), c("c1", "C"), c("l1", null)];
    expect(planClearSet([c("a1", "A"), c("b1", "B")], all, TODAY).sort()).toEqual(["a2", "b2"]);
  });
  it("never clears done tasks, tasks planned for another day, or unplanned tasks", () => {
    const all = [c("a1", "A"), c("done", "A", { done: true }), c("yday", "A", { scheduledFor: "2026-10-26" }), c("none", "A", { scheduledFor: null })];
    expect(planClearSet([c("a1", "A")], all, TODAY)).toEqual([]);
  });
  it("a pick is never in its own clear set", () => {
    expect(planClearSet([c("a1", "A"), c("a2", "A")], [c("a1", "A"), c("a2", "A")], TODAY)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/__tests__/plan-today.test.ts`
Expected: FAIL — module `@/lib/plan-today` not found.

- [ ] **Step 3: Implement `planClearSet`**

In `src/lib/plan-today.ts`, with the header comment style of `src/lib/today-walk.ts` (pure, dates as strings, why it exists: `replace` must never touch another project's plan).

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/lib/__tests__/plan-today.test.ts`
Expected: 5 pass.

- [ ] **Step 5: `get_today_walk` gains `project`**

Add to the input schema: `project: z.string().trim().min(1).optional().describe("Limit the walk to one project in that company (name partial ok, or id). Needs role.")`. In the handler: `if (project && !role) throw new Error("project filter needs role");` then `const p = r && project ? await resolveProject(r.id, r.name, project) : null;` and add `...(p ? { projectId: p.id } : {})` to the `where`. The description gains: "In a project session pass project too, so the walk is that project's."

- [ ] **Step 6: Register `plan_today`**

Right after `update_task`. Schema:

```ts
role: z.string().trim().min(1).describe("Role/company name (partial ok) or id. Required."),
taskIds: z.array(z.string()).min(1).describe("Task keys (VQ-14) or ids to put on today's plan."),
replace: z.boolean().optional().describe("Clear today's other picks in the same project(s) first, so planning twice replaces that project's plan. Never touches another project. Default false."),
```

Description: "Record today's plan for one project session, after Josh confirms the picks. Sets scheduledFor = today on each task. With replace:true, first clears today's plan in the same project(s) as the picks (loose picks clear loose), never the whole company. Refuses a task outside role. Say 'Planned: VQ-1, VQ-2.' and nothing else."

Handler, in order:
1. `const r = await resolveRole(role)`; `const ids = await Promise.all(taskIds.map(resolveTaskId))`.
2. `const picks = await prisma.task.findMany({ where: { id: { in: ids } }, include: { role: { select: { name: true, taskPrefix: true } } } })`. If any pick's `roleId !== r.id` → `throw new Error(\`${key} belongs to ${pick.role.name}, not ${r.name}\`)`. If any id missing → error naming it.
3. `const date = formatDateOnly(today())!`. `let cleared: typeof picks = []`. If `replace`: `const candidates = await prisma.task.findMany({ where: { roleId: r.id, ...OPEN_TASK, scheduledFor: today() }, include: same })`; `const clearIds = planClearSet(toCandidates(picks), toCandidates(candidates), date)` where `toCandidates` maps `{ id, projectId, done, scheduledFor: formatDateOnly(scheduledFor) }`; `updateMany({ where: { id: { in: clearIds } }, data: { scheduledFor: null } })`; `cleared = candidates.filter(c => clearIds.includes(c.id))`.
4. `updateMany({ where: { id: { in: ids } }, data: { scheduledFor: today() } })`; `invalidateRebalanceCache()`.
5. `return ok({ date, role: r.name, planned: picks.map(p => taskKey(p, p.role) ?? p.id), cleared: cleared.map(...) })`.

- [ ] **Step 7: Type-check and full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; 65 + 2 + 5 pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/plan-today.ts src/lib/__tests__/plan-today.test.ts 'src/app/api/mcp/[transport]/route.ts'
git commit -m "feat(mcp): plan_today records a project's picks; walk takes a project"
```

---

### Task 3: Rollover stops clearing `scheduledFor`

**Files:**
- Delete: `src/lib/rollover.ts`
- Modify: `src/app/api/schedule/route.ts:7,16-18` (remove import and call)
- Modify: `CLAUDE.md:390` (UX rule 6)

**Interfaces:**
- Produces: nothing. `UserProfile.lastRolloverOn` stays in the schema (no migration; the column goes unused — data-safe).

- [ ] **Step 1: Delete the rollover and its call**

`git rm src/lib/rollover.ts`. In the schedule route remove the import, the comment block at 16-17, and `await rolloverIfNewDay();`.

- [ ] **Step 2: Narrow UX rule 6**

Replace line 390 with: `6. **End of day is silent.** No summary, no guilt. A task planned for a day that passed is asked once in the next walk ("did this happen?"), never nagged and never counted.`

- [ ] **Step 3: Type-check, grep, suite**

Run: `npx tsc --noEmit && grep -rn rolloverIfNewDay src; npm test`
Expected: tsc clean; grep prints nothing; tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A src/lib/rollover.ts src/app/api/schedule/route.ts CLAUDE.md
git commit -m "fix(today): stop clearing yesterday's plan overnight

A planned task that didn't happen is asked about in the next walk. The
rollover erased the question whenever the web app loaded."
```

---

### Task 4: Board API filters, `/api/projects`, follow-up company filter

**Files:**
- Modify: `src/app/api/board/route.ts`
- Create: `src/app/api/projects/route.ts`
- Modify: `src/app/api/mcp/[transport]/route.ts` (`get_board` follow-up query, ~line 334)

**Interfaces:**
- Produces: `GET /api/board?horizon=&owner=&role=<roleId>&project=<projectId|loose>`. `project` without `role` → 400 `{ error: "project needs role" }`. `role` filters tasks **and** follow-ups by `roleId`; `project` filters tasks by `projectId` (`loose` → `projectId: null`); follow-ups ignore `project`. Pass `role`/`project` into `viewFlags` so any filter lifts the cap. Row shape change: `toUi` returns `role: { id, name, color, taskPrefix, priority }` and `project: { id, name } | null` (include `id` in the Prisma `project` select).
- Produces: `GET /api/projects?roleId=<id>` (session-authed) → `{ id, name, goal }[]` for `status: "active"`, ordered by name. Missing `roleId` → 400.
- Produces, MCP `get_board`: follow-ups `where: { status: "waiting", role: { active: true }, ...(r ? { roleId: r.id } : {}) }`.

- [ ] **Step 1: Board route filters**

Parse `role` and `project` from the query. Validate with the 400 above. Build the task `where` as `{ ...OPEN_TASK, role: { active: true }, ...(role ? { roleId: role } : {}), ...(project ? { projectId: project === "loose" ? null : project } : {}) }`; follow-ups add `...(role ? { roleId: role } : {})`. `viewFlags({ horizon, owner, role: role ?? undefined, project: project ?? undefined })`. Add `priority` to `toUi`'s role and `id` to its project.

- [ ] **Step 2: Projects route**

Session check as in `src/app/api/roles/route.ts`. `prisma.project.findMany({ where: { roleId, status: "active" }, select: { id: true, name: true, goal: true }, orderBy: { name: "asc" } })`.

- [ ] **Step 3: MCP follow-up filter**

The one-line `where` change above.

- [ ] **Step 4: Type-check, suite, lint delta**

Run: `npx tsc --noEmit && npm test && npm run lint 2>&1 | grep -ci error`
Expected: clean; tests pass; `25`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/board/route.ts src/app/api/projects/route.ts 'src/app/api/mcp/[transport]/route.ts'
git commit -m "feat(api): board filters by company and project; projects list for the chips"
```

---

### Task 5: Chips and grouping in `DispatchBoard`

**Files:**
- Create: `src/lib/board-groups.ts`, `src/lib/__tests__/board-groups.test.ts`
- Modify: `src/components/DispatchBoard.tsx` (state ~141-197, `BoardRow` type ~13-17, render ~279-307)
- Modify: `src/app/(app)/page.tsx` (wrap `FocusPage` in `<Suspense>` — `useSearchParams` needs it at build time)

**Interfaces:**
- Consumes: `GET /api/board` with `role`/`project` (Task 4), `GET /api/projects?roleId=` (Task 4), `GET /api/roles` (existing; `{ id, name, color, priority }` — ignore `_count`, it is never rendered).
- Produces, `src/lib/board-groups.ts`:
  ```ts
  export interface GroupableRow { id: string; role: { id: string; name: string; color: string; priority: number }; project: { id: string; name: string } | null }
  export interface ProjectGroup<T> { projectId: string | null; name: string | null; rows: T[] }   // name null = loose
  export interface CompanyGroup<T> { roleId: string; name: string; color: string; projects: ProjectGroup<T>[] }
  /** Company by Role.priority, project A→Z (base sensitivity) with loose last; rows keep their incoming order. */
  export function groupBoard<T extends GroupableRow>(rows: T[]): CompanyGroup<T>[]
  ```

- [ ] **Step 1: Failing tests for `groupBoard`**

```ts
import { describe, expect, it } from "vitest";
import { groupBoard } from "@/lib/board-groups";

const zeta = { id: "r1", name: "Zeta", color: "#1", priority: 1 };
const vquip = { id: "r2", name: "vQuip", color: "#2", priority: 2 };
const row = (id: string, role: typeof zeta, project: { id: string; name: string } | null) => ({ id, role, project });

describe("groupBoard", () => {
  it("orders companies by priority regardless of row order", () => {
    const g = groupBoard([row("a", vquip, null), row("b", zeta, null)]);
    expect(g.map((c) => c.name)).toEqual(["Zeta", "vQuip"]);
  });
  it("orders projects A to Z, case-insensitive, loose last", () => {
    const g = groupBoard([row("a", vquip, null), row("b", vquip, { id: "p2", name: "ops dashboard" }), row("c", vquip, { id: "p1", name: "AWS cost" })]);
    expect(g[0].projects.map((p) => p.name)).toEqual(["AWS cost", "ops dashboard", null]);
  });
  it("keeps the incoming row order inside a group", () => {
    const g = groupBoard([row("first", vquip, { id: "p1", name: "A" }), row("second", vquip, { id: "p1", name: "A" })]);
    expect(g[0].projects[0].rows.map((r) => r.id)).toEqual(["first", "second"]);
  });
  it("a company with only loose tasks still gets a group", () => {
    const g = groupBoard([row("a", zeta, null)]);
    expect(g).toHaveLength(1);
    expect(g[0].projects[0].projectId).toBeNull();
  });
  it("returns nothing for no rows", () => {
    expect(groupBoard([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/lib/__tests__/board-groups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `groupBoard`**

Pure; no counts in the output shape.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/lib/__tests__/board-groups.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Chips, URL state, grouped render in `DispatchBoard.tsx`**

- `BoardRow.role` gains `priority: number`; `project` becomes `{ id: string; name: string } | null`.
- Read `role`/`project` from `useSearchParams()` on mount; write them back with `useRouter().replace(\`?\${qs}\`, { scroll: false })` whenever they change (omit empty params; `project` can be an id or `loose`).
- Fetch `/api/roles` once on mount → `companies` (`id, name, color`); fetch `/api/projects?roleId=` whenever `role` changes → `projects`; clear `project` when `role` changes.
- `load()`: when `role` is set, always send `horizon`, `owner`, `role`, and `project` if set (any filter lifts the cap server-side, so `expanded` is implied); otherwise keep today's logic unchanged.
- Chip rows under the toggles, each a `Segmented`-style row: company chips `All` + each company (dot in its color, name), then — only when a company is picked — project chips `All` + each project + `Loose`. Chips are buttons ≥44px tall, selected one filled like the toggles. No numbers on chips.
- Render: when `expanded || role` → `groupBoard(data.board)` and render company header (`SECTION_LABEL` style + 6px color dot), then each project header (`SECTION_LABEL`, indented, name or "loose"), then rows. Otherwise the flat list exactly as now. `AnimatePresence` stays around rows so ticks still slide out. **The company header is skipped when a company filter is set** (it would repeat the chip); the project header is skipped when a project filter is set.
- Stuck / Waiting on / In review stay flat below, as now.
- `pickHorizon`/`pickOwner` keep resetting `expanded`; the chips never do.

- [ ] **Step 6: Suspense wrapper**

`src/app/(app)/page.tsx` renders `<Suspense fallback={null}><FocusPage /></Suspense>`.

- [ ] **Step 7: Type-check, suite, lint delta, build**

Run: `npx tsc --noEmit && npm test && npm run lint 2>&1 | grep -ci error && npm run build 2>&1 | tail -5`
Expected: clean; tests pass; `25`; build succeeds with no `useSearchParams` warning.

- [ ] **Step 8: Commit**

```bash
git add src/lib/board-groups.ts src/lib/__tests__/board-groups.test.ts src/components/DispatchBoard.tsx 'src/app/(app)/page.tsx'
git commit -m "feat(today): company and project chips; expanded board reads company then project"
```

---

### Task 6: Teach the sessions

**Files:**
- Modify: `src/lib/mcp-instructions.ts`
- Modify: `~/projects/jtmg/command-center-boilerplate/.claude/skills/conductor/SKILL.md` (new sections after "Projects"), then `tooling/sync-conductor-skills.sh`
- Modify: `~/projects/jtmg/home/.claude/skills/dispatch/SKILL.md` (move 5)
- Modify: `CLAUDE.md` (MCP section ~616-621; UX rule 4 line 388)

**Interfaces:** none.

- [ ] **Step 1: Instructions line, within 300 words**

Add after the Projects lines: `- Project sessions: declare the project once (CLAUDE.md "Conductor project:" line, else ask from list_projects); it is the default for every task. "Plan today": get_today_walk with project, propose at most five, and after Josh confirms call plan_today with replace true.`

Then trim elsewhere until `npx vitest run src/lib/__tests__/mcp-instructions.test.ts` passes. Candidates: the Morning walk line's parenthetical, "Offer a new project only when 2+ tasks share a goal or a spec or repo backs it" → "Offer a new project only when 2+ tasks share a goal." Keep every rule; shorten wording only.

- [ ] **Step 2: `conductor` skill sections**

After "## Projects", add:

`## Declare the project` — the first time this session touches Conductor: if the repo `CLAUDE.md` has a `Conductor project: <name>` line, use it and don't ask. Otherwise ask "which project is this session on?" with options from `list_projects({ role })` plus "none" (company-wide). Say it back once: "This session is vQuip · Defense Hub." It is the default `project` for every `create_task`, not a hard rule — log-meeting still proposes per task. "What's left?", "what's up?", and "plan today" are scoped to it. "Switch to X" changes it.

`## Plan today` — on "plan today", "what do we need to get done today?", or "scaffold today": (1) `get_today_walk({ role, project })` (no `project` for a "none" session). (2) Propose at most five, in this preference: past due (asked as "did this happen?" first), due today, due this week, in progress, then what moves the project's `doneWhen`. Read `get_meetings` for the company and say when one changes the pick. One line per task, no counts. (3) Josh confirms, trims, or adds. (4) `plan_today({ role, taskIds, replace: true })` once; planning twice replaces that project's plan, never the company's. (5) Say "Planned: VQ-280, VQ-299." and nothing else. Unplanning is `update_task { isToday: false }`.

Update the morning-walk section's step 1 to mention passing `project` in a project session, and that `urgent` now includes today's planned picks.

- [ ] **Step 3: Sync and commit in the three repos**

```bash
cd ~/projects/jtmg/command-center-boilerplate && bash tooling/sync-conductor-skills.sh
git add .claude/skills/conductor/SKILL.md && git commit -m "docs(conductor): declare the project; plan today"
for t in ~/projects/vquip/engineering/vquip-command-center ~/projects/react-health/react-health-command-center; do git -C "$t" add .claude/skills && git -C "$t" commit -m "docs: sync conductor skill (plan today)"; done
```

- [ ] **Step 4: Home `dispatch` skill**

Move 5 gains: "By company/project" → `get_board({ role, project })`; a planned-today task sits with urgent at the top.

```bash
cd ~/projects/jtmg/home && git add .claude/skills/dispatch/SKILL.md && git commit -m "docs(dispatch): board by company and project"
```

- [ ] **Step 5: Repo `CLAUDE.md`**

In the MCP section: `get_today_walk` takes `project`; `plan_today` (one line, same wording as the tool description); `get_board` follow-ups follow `role`; `GET /api/board` takes `role`/`project` (`loose`), `GET /api/projects?roleId=`; planned-today ranks with urgent. UX rule 4: add "Expanded or filtered, it reads company → project, loose last; chips filter by company then project."

- [ ] **Step 6: Instructions test and commit**

Run: `npm test`
Expected: pass, including the 300-word test.

```bash
cd ~/projects/jtmg/conductor && git add src/lib/mcp-instructions.ts CLAUDE.md
git commit -m "docs: project sessions, plan today, board filters"
```

---

### Task 7: Deploy and live check

**Files:** none.

- [ ] **Step 1: Deploy**

Run: `cd ~/projects/jtmg/conductor && docker compose up -d --build && docker compose logs conductor | tail -3`
Expected: `✓ Ready`.

- [ ] **Step 2: MCP round trip (controller, scratchpad `mcpcall.sh`)**

- `create_task { role: "Conductor", text: "scratch: plan A", refine: false }` twice (A1, A2) and once `"scratch: plan B"` (B1). Note their keys.
- `plan_today { role: "Conductor", taskIds: [A1, A2] }` → `planned` lists both.
- `plan_today { role: "Conductor", taskIds: [B1], replace: true }` → `cleared: [A1, A2]` (all three are loose, so loose clears loose). Then `plan_today { role: "Conductor", taskIds: [A1], replace: true }` → `cleared: [B1]`.
- `get_today_walk { role: "Conductor" }` → A1 is in `urgent`.
- `plan_today { role: "vQuip", taskIds: [A1] }` → error naming Conductor.
- `get_board { role: "Conductor", project: "<nonexistent>" }` → error from `matchProject`.
- Delete the three scratch tasks by id.

- [ ] **Step 3: Browser check (Chrome, logged in at http://localhost:5402)**

- Today: seven flat rows, `more`; no company chips change that. No number anywhere.
- Click **vQuip**: the list expands, grouped by project with loose last, no company header; project chips appear; URL has `?role=`.
- Click a project chip: only its rows; Stuck/In review follow it; URL has `?project=`.
- Click **Loose**: only rows with no project.
- Reload the URL: the same filter is restored.
- Click **All** (company): back to the flat seven.
- `more` with no filter: grouped by company → project, company headers with dots.

- [ ] **Step 4: Push**

`git push` (conductor only; the command centers were committed in Task 6 — push those too).
