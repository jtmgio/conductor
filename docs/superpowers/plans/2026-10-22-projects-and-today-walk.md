# Projects + Today Walk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-company projects, a "don't show before" date, and a server-computed morning walk to Conductor's MCP surface, and teach every Claude session to use them.

**Architecture:** Two pure, unit-tested libraries (`today-walk.ts`, `projects.ts`) hold the logic. The MCP route wires them to Prisma, the way `resolveRole` already lives in the route. The rules reach sessions through MCP server `instructions` plus rewritten boilerplate skills that a sync script copies into the two command centers.

**Tech Stack:** Next.js 14 App Router, Prisma 5 / Postgres 16, `mcp-handler` 1.1.0 + `@modelcontextprotocol/sdk` 1.26.0, Zod, Vitest (new, dev only).

**Spec:** `docs/superpowers/specs/2026-10-22-projects-design.md`

## Global Constraints

- A project belongs to exactly one role; a task's project must be in the task's role.
- Projects are referred to by name (exact → case-insensitive → partial), scoped to one role. No project keys.
- `links` are pointers (paths/URLs). Never copy linked content into Conductor.
- The server never infers a project. Unknown project → error listing that role's projects; task not created.
- `update_project done:true` refuses while open tasks remain and returns their keys.
- Walk sections in order: `urgent`, `pastDue`, `today`, `thisWeek`, `inProgress`, `rest`. Each task appears once, in its first match.
- `notBefore > today` hides a task from the walk. `newlyAvailable` = `notBefore` within the last 3 days (today, -1, -2).
- Blocked tasks: out of the walk unless blocked 3+ days or `blockedAt` null (mirrors `BLOCKED_STALE_DAYS = 3` in `TodayCockpit.tsx`), then in `blockedCheckIn`. `in_review` → `waitingOnReview`.
- No counts in any prose the server returns. No badge counts in UI.
- Server `instructions` ≤ ~300 words.
- UI change is a project chip on Board cards and Today rows only. Detail drawer out of scope.
- Use the `@/lib/prisma` singleton. CSS variables for theming. No `console.log`.
- Commit messages: Conventional Commits, no AI attribution, no `Co-Authored-By`, no `Claude-Session` trailer.
- The working tree has unrelated uncommitted changes in `src/app/globals.css`, `src/app/login/page.tsx`, `src/components/GlobalSearch.tsx`, `src/components/TodayCockpit.tsx`, `src/lib/auth.ts`. Never stage them. Stage by hunk where a file overlaps.

## Review Focus

1. **Day boundaries.** `dueDate` is a timestamp stored at container midnight (container TZ is UTC). The walk must classify a task by the same `YYYY-MM-DD` that `taskShape` shows. Pinned by the shared `isoDay()` helper and its test (Task 1).
2. **Ambiguous partial names.** "ops" matching both "Ops chat" and "Ops dashboard" must error with both names, never pick the first. Pinned in Task 2's `matchProject` tests.
3. **Cross-company projects.** Moving a task to another role without a new project must clear `projectId`; a project name is only ever resolved inside the task's role. Pinned by `projectIdAfterRoleChange` tests (Task 2) and the live check in Task 6.
4. **Firewall.** A command center must call `get_today_walk` with its own `role`. Omitting `role` returns every company. Pinned by the instructions text and the end-to-end check (Task 9).
5. **Josh's uncommitted edits.** `TodayCockpit.tsx` is both modified and in this plan. Pinned by the `git diff --cached` check in Task 7.

---

### Task 1: Test runner, `isoDay`, and `buildWalk`

**Files:**
- Modify: `package.json` (add `"test": "vitest run"`, dev dep `vitest@3.2.4`)
- Create: `vitest.config.ts` (node environment, alias `@` → `./src`)
- Modify: `src/lib/dates.ts` (add `isoDay`)
- Create: `src/lib/today-walk.ts`
- Test: `src/lib/__tests__/dates.test.ts`, `src/lib/__tests__/today-walk.test.ts`

**Interfaces:**
- Produces:
  - `isoDay(d: Date | null | undefined): string | null` in `src/lib/dates.ts`. Returns `d.toISOString().split("T")[0]` (the exact conversion `taskShape` uses for `dueDate` today).
  - In `src/lib/today-walk.ts`:
    ```ts
    export interface WalkTask {
      key: string; title: string; status: string; priority: string;
      dueDate: string | null;      // YYYY-MM-DD
      scheduledFor: string | null; // YYYY-MM-DD
      notBefore: string | null;    // YYYY-MM-DD
      blockedAt: string | null;    // ISO timestamp
      createdAt: string;           // ISO timestamp
      project: string | null;      // project name
    }
    export type WalkSection = "urgent" | "pastDue" | "today" | "thisWeek" | "inProgress" | "rest";
    export const WALK_SECTIONS: WalkSection[]; // the order above
    export interface WalkEntry<T extends WalkTask> { task: T; pastDue: boolean; newlyAvailable: boolean }
    export interface Walk<T extends WalkTask> {
      sections: Record<WalkSection, WalkEntry<T>[]>;
      blockedCheckIn: (WalkEntry<T> & { blockedDays: number | null })[];
      waitingOnReview: WalkEntry<T>[];
    }
    export function buildWalk<T extends WalkTask>(tasks: T[], today: string, now?: Date): Walk<T>;
    ```
    Input is open tasks only (caller filters `done` and `icebox`). Generic `T` so callers keep their extra fields.

- [ ] **Step 1: Install Vitest and add the script and config**

Run: `npm install -D vitest@3.2.4`
Add `"test": "vitest run"` to `scripts`. `vitest.config.ts`: `environment: "node"`, `resolve.alias: { "@": path.resolve(__dirname, "src") }`, `include: ["src/**/*.test.ts"]`.

- [ ] **Step 2: Write the failing tests**

`dates.test.ts`:
- `isoDay(new Date("2026-10-22T00:00:00Z"))` → `"2026-10-22"`; `isoDay(null)` → `null`.

`today-walk.test.ts`, with `today = "2026-10-22"`, `now = new Date("2026-10-22T15:00:00Z")`, and a `t(overrides)` factory (defaults: `status: "backlog"`, `priority: "normal"`, all dates null, `createdAt: "2026-10-01T00:00:00Z"`, `project: null`):
- `urgent first, and an urgent past-due task stays in urgent with pastDue true` — urgent `dueDate "2026-10-16"` appears only in `sections.urgent`, `pastDue === true`.
- `pastDue by dueDate` — `dueDate "2026-10-21"` → `pastDue`.
- `pastDue by a stale scheduledFor` — `scheduledFor "2026-10-20"`, no due date → `pastDue`, `pastDue === true`.
- `today by dueDate or scheduledFor` — `dueDate "2026-10-22"` and `scheduledFor "2026-10-22"` both → `today`.
- `thisWeek boundary` — `dueDate "2026-10-29"` → `thisWeek`; `"2026-10-30"` → `rest`.
- `inProgress` — `status "in_progress"`, no dates → `inProgress`.
- `rest groups by project A→Z, loose last` — projects `"ops chat"`, `"AWS cost"`, null → order AWS cost, ops chat, loose (case-insensitive compare).
- `section sort: dueDate asc, nulls last, createdAt tiebreak`.
- `each task appears exactly once` — total entries across sections + side lists equals visible input count.
- `notBefore in the future hides the task` — `notBefore "2026-10-23"` appears nowhere.
- `newlyAvailable covers three days` — `notBefore "2026-10-20"` → `newlyAvailable true`; `"2026-10-19"` → `false`.
- `blocked under 3 days is left out` — `blockedAt "2026-10-20T16:00:00Z"` appears nowhere.
- `blocked 3+ days goes to blockedCheckIn` — `blockedAt "2026-10-19T15:00:00Z"` → `blockedCheckIn`, `blockedDays === 3`.
- `blocked with no blockedAt goes to blockedCheckIn` — `blockedDays === null`.
- `in_review goes to waitingOnReview, not the main walk`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `isoDay` / `buildWalk` not exported.

- [ ] **Step 4: Implement `isoDay` and `buildWalk`**

`buildWalk` compares `YYYY-MM-DD` strings lexicographically. Add a private `addDaysYmd(ymd, n)` using `Date.UTC`. Order of checks per task: hidden by `notBefore` → blocked → in_review → first matching section. `blockedDays = Math.floor((now - Date.parse(blockedAt)) / 86_400_000)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests in both files.

- [ ] **Step 6: Make `taskShape` use `isoDay`**

In `src/app/api/mcp/[transport]/route.ts`, replace `t.dueDate ? t.dueDate.toISOString().split("T")[0] : null` with `isoDay(t.dueDate)`. Run `npx tsc --noEmit`; expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/dates.ts src/lib/today-walk.ts src/lib/__tests__ "src/app/api/mcp/[transport]/route.ts"
git commit -m "feat(walk): pure morning-walk ordering with vitest"
```

---

### Task 2: Project matching helpers

**Files:**
- Create: `src/lib/projects.ts` (pure, no Prisma import)
- Test: `src/lib/__tests__/projects.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ProjectRef { id: string; name: string }
  export function matchProject<T extends ProjectRef>(projects: T[], ref: string, roleName: string): T;
  export function projectIdAfterRoleChange(args: {
    roleChanged: boolean; currentProjectId: string | null; requestedProjectId: string | null | undefined;
  }): string | null | undefined; // undefined = leave column untouched
  ```

- [ ] **Step 1: Write the failing tests**

- `matches by id`, `matches exact name`, `matches case-insensitively` ("aws cost" → "AWS cost").
- `exact match wins over partial` — projects "Ops" and "Ops chat", ref "Ops" → "Ops".
- `unique partial match` — "kibana" → "Logs / Kibana replacement".
- `ambiguous partial throws with both names` — "ops" vs "Ops chat", "Ops dashboard" → throws, message contains `Ops chat` and `Ops dashboard`.
- `unknown throws listing the role's projects` — message contains `vQuip` and every project name; with zero projects, message says the role has no projects yet.
- `projectIdAfterRoleChange`: role changed + no request → `null`; role changed + requested id → that id; role unchanged + no request → `undefined`; requested `null` → `null`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- projects`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement both functions** — same precedence as `resolveRole` in the MCP route, plus the ambiguity check.

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projects.ts src/lib/__tests__/projects.test.ts
git commit -m "feat(projects): name matching scoped to one company"
```

---

### Task 3: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261022120000_add_projects/migration.sql`

**Interfaces:**
- Produces: Prisma model `Project { id, roleId, role, name, goal?, doneWhen?, links Json @default("[]"), status @default("active"), tasks Task[], createdAt, updatedAt; @@unique([roleId, name]); @@index([roleId, status]) }`. `Role.projects Project[]`. `Task.projectId String?`, `Task.project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)`, `Task.notBefore DateTime? @db.Date` (with a `///` comment: "don't bring this up before this day"), `@@index([projectId, done])`.

- [ ] **Step 1: Edit the schema** as above. Comment style matches the existing `///` comments on `blockedReason`.

- [ ] **Step 2: Write the migration by hand** (repo convention — see `20260728180000_blocked_reason`):

```sql
-- Projects: a company's piece of work that holds the context its tasks share.
CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "goal" TEXT,
  "doneWhen" TEXT,
  "links" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Project_roleId_name_key" ON "Project"("roleId", "name");
CREATE INDEX "Project_roleId_status_idx" ON "Project"("roleId", "status");
ALTER TABLE "Project" ADD CONSTRAINT "Project_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tasks can sit in a project, and can wait until a day before they surface.
ALTER TABLE "Task" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Task" ADD COLUMN "notBefore" DATE;
CREATE INDEX "Task_projectId_done_idx" ON "Task"("projectId", "done");
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate and generate**

Run: `npx prisma validate && npx prisma generate && npx tsc --noEmit`
Expected: schema valid, client generated, no new type errors.

- [ ] **Step 4: Commit** (not applied to the live DB yet — Task 8 does that)

```bash
git add prisma/schema.prisma prisma/migrations/20261022120000_add_projects
git commit -m "feat(db): add Project model and Task.notBefore"
```

---

### Task 4: MCP project tools

**Files:**
- Modify: `src/app/api/mcp/[transport]/route.ts`

**Interfaces:**
- Consumes: `matchProject` (Task 2), Prisma `Project` (Task 3), existing `resolveRole`, `ok`, `taskKey`.
- Produces (in the route file, beside `resolveRole`):
  `async function resolveProject(roleId: string, roleName: string, ref: string, opts?: { includeDone?: boolean }): Promise<{ id: string; name: string }>` — loads that role's projects (active only unless `includeDone`) and calls `matchProject`.
  `function projectShape(p, openTaskKeys: string[])` → `{ name, goal, doneWhen, links, status, openTasks }`.

- [ ] **Step 1: Add `resolveProject` and `projectShape`.**

- [ ] **Step 2: Register `list_projects`** — input `role` (required), `includeDone?`. Returns `projectShape` for each, `openTasks` = keys of that project's tasks with `done = false`, status not `icebox`. Sorted by name.

- [ ] **Step 3: Register `create_project`** — input `role`, `name` (min 1), `goal?`, `doneWhen?`, `links?: string[]`. Before insert, `findFirst` with `name: { equals, mode: "insensitive" }` in that role; if found, throw `Project "<existing>" already exists in <role>`. Returns `{ created: projectShape }`.

- [ ] **Step 4: Register `update_project`** — input `role`, `project`, `name?`, `goal?`, `doneWhen?`, `links?`, `done?: boolean`. Resolve with `includeDone: true`. `done: true` with open tasks → return `ok({ refused: true, reason: "Project still has open tasks", openTasks: [...keys], instruction: "Ask Josh what to do with these tasks: finish, move to another project, or remove the project from them. Then try again." })` and do not update. `done: true` → `status: "done"`; `done: false` → `"active"`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/mcp/[transport]/route.ts"
git commit -m "feat(mcp): list, create and update projects"
```

---

### Task 5: Tasks take a project and a notBefore date

**Files:**
- Modify: `src/app/api/mcp/[transport]/route.ts`

**Interfaces:**
- Consumes: `resolveProject` (Task 4), `projectIdAfterRoleChange` (Task 2), `isoDay`, `formatDateOnly`.
- Produces: `taskShape` gains `project: string | null` and `notBefore: string | null`. Every `include` that feeds `taskShape` adds `project: { select: { name: true } }`.

- [ ] **Step 1: Extend `taskShape`** and its input type; update every `include` that feeds it (`get_context`, `list_tasks`, `create_task`, `update_task`, `refine_task`, `search` if it uses it).

- [ ] **Step 2: `create_task`** — add `project?: string` ("Project name in this role. Call list_projects first. Never guessed by the server.") and `notBefore?: string` ("YYYY-MM-DD. Use for 'after X' / 'not before X'. Not a deadline."). Resolve `project` only after the role is resolved. If role is unresolved, the existing `needsClarification` path runs unchanged. Unknown project → the tool errors (task not created).

- [ ] **Step 3: `update_task`** — add `project?: string | null` and `notBefore?: string | null`. Compute `projectId` with `projectIdAfterRoleChange({ roleChanged: role !== undefined && newRoleId !== current.roleId, currentProjectId, requestedProjectId })`, resolving a requested name inside the **new** role. Write the column only when the helper returns non-`undefined`.

- [ ] **Step 4: `list_tasks`** — add `project?: string`. Requires `role`; if `project` is given without `role`, throw `"project filter needs role"`. With a project filter, drop `take: 50`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/mcp/[transport]/route.ts"
git commit -m "feat(mcp): tasks carry a project and a notBefore date"
```

---

### Task 6: `get_today_walk`, server instructions, tool descriptions

**Files:**
- Create: `src/lib/mcp-instructions.ts` (exports `CONDUCTOR_MCP_INSTRUCTIONS: string`)
- Modify: `src/app/api/mcp/[transport]/route.ts`
- Test: `src/lib/__tests__/mcp-instructions.test.ts`

**Interfaces:**
- Consumes: `buildWalk`, `WALK_SECTIONS` (Task 1), `taskShape` (Task 5), `isoDay`, `formatDateOnly`, `today()`.
- Produces: MCP tool `get_today_walk({ role?: string })`.

- [ ] **Step 1: Write the failing instructions test**

`mcp-instructions.test.ts`:
- word count of `CONDUCTOR_MCP_INSTRUCTIONS` ≤ 300.
- contains `get_today_walk`, `list_projects`, `notBefore`, `create_followup`, `did this happen`.
- contains the phrase `pass the role of the command center you are in` (firewall, Review Focus 4).

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- mcp-instructions`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `CONDUCTOR_MCP_INSTRUCTIONS`** from the draft in spec §6, adding the firewall line. Exact copy is the spec's draft plus: "Always pass the role of the command center you are in; never show another company's tasks there."

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Wire `instructions`** — in the `createMcpHandler` server options, next to `serverInfo`, add `instructions: CONDUCTOR_MCP_INSTRUCTIONS`.

- [ ] **Step 6: Register `get_today_walk`**

Query open tasks (`done: false`, status not `icebox`, role filter if given) with `role` and `project` includes. Map each to `{ ...taskShape(t), scheduledFor: formatDateOnly(t.scheduledFor), notBefore: formatDateOnly(t.notBefore), blockedAt: t.blockedAt?.toISOString() ?? null, blockedReason: t.blockedReason, createdAt: t.createdAt.toISOString() }` and call `buildWalk(rows, formatDateOnly(today())!)`.

Response: `{ date, role, sections: [{ name, entries }] in WALK_SECTIONS order, omitting empty ones, blockedCheckIn, waitingOnReview, projects: { [name]: { goal, doneWhen, links } } for every project referenced }`. Each entry: `{ ...task, pastDue, newlyAvailable, checkFirst: section === "pastDue" }`. With no `role`, return `{ date, companies: [{ role, ...same shape }] }` in role-priority order. No counts anywhere.

Description: "The morning walk. Call this for 'what's up today' and similar. Pass this command center's role. Returns open tasks in the order to walk them, one at a time."

- [ ] **Step 7: Update tool descriptions**

- `create_task`: append "In a command center, call list_projects first and pass project when one fits. Use notBefore, not dueDate, for wait-until dates."
- `update_task`: append "Mark done as soon as work in this session finishes the task, and tell Josh in one line."
- `get_context`: change "Call this first to orient." to "For 'what's up today', use get_today_walk instead."

- [ ] **Step 8: Type-check and test**

Run: `npx tsc --noEmit && npm test`
Expected: no new type errors; all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/mcp-instructions.ts src/lib/__tests__/mcp-instructions.test.ts "src/app/api/mcp/[transport]/route.ts"
git commit -m "feat(mcp): today walk tool and server instructions"
```

---

### Task 7: Project chip on Board and Today

**Files:**
- Modify: `src/app/api/tasks/board/route.ts` (both `include`s)
- Modify: `src/app/api/tasks/route.ts` (GET `include`)
- Modify: `src/app/(app)/board/BoardPage.tsx` (`BoardTask` type + `BoardCard` chip, beside the `#tag` chips ~line 545)
- Modify: `src/components/TodayCockpit.tsx` (`Task` type + chip beside `TaskKeyChip` ~line 601) — **has Josh's uncommitted edits**

**Interfaces:**
- Consumes: Prisma `Task.project` (Task 3).
- Produces: API task objects carry `project: { name: string } | null`.

- [ ] **Step 1: Add `project: { select: { name: true } }`** to the three `include`s.

- [ ] **Step 2: Add `project?: { name: string } | null`** to `BoardTask` and the cockpit `Task` type. Render, when present, a chip using the neighbouring chip's classes and `var(--text-secondary)` / `var(--border-subtle)`, with a Lucide `FolderKanban` icon at 12px and the project name.

- [ ] **Step 3: Build**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors or lint failures.

- [ ] **Step 4: Stage only this task's hunks**

Run: `git add src/app/api/tasks/board/route.ts src/app/api/tasks/route.ts "src/app/(app)/board/BoardPage.tsx" && git add -p src/components/TodayCockpit.tsx` (accept only the `project` type line and the chip).
Then: `git diff --cached --stat` and `git diff --cached src/components/TodayCockpit.tsx`.
Expected: the cockpit diff contains only project lines; `globals.css`, `login/page.tsx`, `GlobalSearch.tsx`, `auth.ts` not staged.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): show project on board and today cards"
```

---

### Task 8: Ship to the tower and verify live

**Files:** none (operations). Josh present for the migration (tower rule: data ops are staged and watched).

- [ ] **Step 1: Back up the database**

Run: `mkdir -p ~/backups/2026-10-22-conductor-projects && docker exec postgres pg_dump -U conductor conductor | gzip > ~/backups/2026-10-22-conductor-projects/conductor.sql.gz && ls -lh ~/backups/2026-10-22-conductor-projects/`
Expected: a non-empty `.sql.gz`.

- [ ] **Step 2: Rebuild**

Run: `docker compose up -d --build conductor && docker compose logs conductor | tail -20`
Expected: `Running Prisma migrations...`, `20261022120000_add_projects` applied, then `✓ Ready`.

- [ ] **Step 3: Confirm the DB matches the schema**

Run: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
Expected: `-- This is an empty migration.`

- [ ] **Step 4: Confirm instructions and tools over MCP**

POST `initialize` then `tools/list` to `http://localhost:5402/api/mcp/mcp` with `Authorization: Bearer $MCP_API_TOKEN` (from `.env`), `Accept: application/json, text/event-stream`.
Expected: `initialize` result has `instructions` with the walk text; `tools/list` includes `list_projects`, `create_project`, `update_project`, `get_today_walk`.

- [ ] **Step 5: Live round-trip on a scratch project in the `Conductor` role**

Through the MCP tools: `create_project` "Walk test" → `create_task` with `project: "Walk test"`, `notBefore` tomorrow → `get_today_walk({ role: "Conductor" })` does not show it → `update_task` `notBefore: null` → walk shows it → `update_project done:true` is refused with its key → `update_task role: "Personal"` → `list_tasks` shows `project: null` (Review Focus 3) → `delete_task` → `update_project done:true` succeeds.
Expected: each result as stated.

- [ ] **Step 6: Eyeball the chip** on `/board` and Today for a task with a project (use the `run` or `verify-feature` skill), then clean up the scratch data.

---

### Task 9: Skills, docs, and the vQuip backfill

**Files:**
- Modify: `~/projects/jtmg/command-center-boilerplate/.claude/skills/conductor/SKILL.md`
- Modify: `~/projects/jtmg/command-center-boilerplate/.claude/skills/log-meeting/SKILL.md` (Step 7 "Routing the action items")
- Create: `~/projects/jtmg/command-center-boilerplate/tooling/sync-conductor-skills.sh`
- Modify: `CLAUDE.md` (this repo — MCP section tool list + projects + walk)
- Modify: `~/.claude/CLAUDE.md` (Conductor section → pointer) — **with Josh present**
- Branch in `~/projects/vquip/engineering/defensehub-v5`: remove `.claude/skills/{conductor,log-meeting,start}`

- [ ] **Step 1: Rewrite the `conductor` skill**

Keep: division of labor, explicit role, firewall, routing table, search-first, backlog default, calendar lane. Change:
- "Never nag about overdue" → "Never raise due dates outside the morning walk. Inside it, past-due tasks are asked as 'did this happen?'"
- Add sections: **Morning walk** (call `get_today_walk` with this role, one task at a time, read a task's project links to explain it), **Projects** (call `list_projects`, propose a project per task, offer a new one only for 2+ tasks sharing a goal or a spec/repo), **Wait dates** (`notBefore`), **Close as you go** (mark done, one line).
- Reading section: list `get_today_walk`, `list_projects`, and the `project` filter.

- [ ] **Step 2: Update `log-meeting`** — the conductor row of the routing table: "a conductor task with its project (call `list_projects` first; show each proposed task with its project and any proposed new project; create only what Josh confirms)".

- [ ] **Step 3: Write `sync-conductor-skills.sh`**

Copies `conductor`, `log-meeting`, `start` from the boilerplate into each target with `rsync -a --delete`. Targets: `~/projects/vquip/engineering/vquip-command-center` and `~/projects/react-health/react-health-command-center`. Prints `git -C <target> status --short .claude/skills` for each. Does not commit.

- [ ] **Step 4: Run it and verify**

Run: `bash tooling/sync-conductor-skills.sh && md5 -q ~/projects/jtmg/command-center-boilerplate/.claude/skills/conductor/SKILL.md ~/projects/vquip/engineering/vquip-command-center/.claude/skills/conductor/SKILL.md ~/projects/react-health/react-health-command-center/.claude/skills/conductor/SKILL.md`
Expected: three identical hashes.

- [ ] **Step 5: Commit in the boilerplate and both command centers** (local commits; push only on Josh's go)

```bash
git -C ~/projects/jtmg/command-center-boilerplate add .claude/skills tooling/sync-conductor-skills.sh && git -C ~/projects/jtmg/command-center-boilerplate commit -m "feat(skills): conductor projects and morning walk"
git -C ~/projects/vquip/engineering/vquip-command-center add .claude/skills && git -C ~/projects/vquip/engineering/vquip-command-center commit -m "chore(skills): sync conductor skills from boilerplate"
git -C ~/projects/react-health/react-health-command-center add .claude/skills && git -C ~/projects/react-health/react-health-command-center commit -m "chore(skills): sync conductor skills from boilerplate"
```

- [ ] **Step 6: DefenseHub removal branch**

In `defensehub-v5` (on `main`, clean tree first): `git switch -c chore/remove-personal-skills && git rm -r .claude/skills/conductor .claude/skills/log-meeting .claude/skills/start && git commit -m "chore: remove personal task-system skills"`. Do **not** push or open the PR until Josh says go — it's a vQuip work repo.

- [ ] **Step 7: Update this repo's `CLAUDE.md`** MCP section: tools list adds the four new tools; one paragraph each on projects, `notBefore`, and the walk; note that `src/lib/mcp-instructions.ts` is the source of truth for session rules. Commit: `docs: projects and today walk in CLAUDE.md`.

- [ ] **Step 8: Trim `~/.claude/CLAUDE.md` with Josh**

Show Josh the diff first. Replace the "How to use it" tool-behavior bullets in the Conductor section with: "Conductor's MCP server sends its rules when a session connects (`src/lib/mcp-instructions.ts` in the conductor repo). Those are the source of truth." Keep "When to use it" and "Norms". Apply only after Josh approves.

- [ ] **Step 9: End-to-end check and backfill (in a fresh vQuip command center session, Josh present)**

- Say only "what's up today". Expected: Claude calls `get_today_walk` with `role: "vQuip"` and opens with urgent tasks (VQ-298), with no extra prompting.
- Backfill per spec §8: propose the five projects and assignments, the `dueDate` → `notBefore` moves (VQ-289, VQ-290, VQ-326), and the past-due checks (VQ-318, VQ-299). Create only what Josh confirms.
