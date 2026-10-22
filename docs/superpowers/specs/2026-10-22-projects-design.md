# Projects + headless Conductor — design

Date: 2026-10-22
Status: draft, awaiting Josh's approval

## Why

Josh has stopped using the Conductor UI. His work happens in one Claude Code
"command center" per company (vQuip, Zeta, HealthMe, ...). That's where he
logs meetings, files tasks, and asks "what's up today?" He wants Claude to run
his task list for him there:

- At the start of the day: "what's up for vQuip today?" Claude leads with what's
  urgent, then what's due, then the rest, and walks him through them one at a time.
- During the day: Claude files tasks from meetings, explains what a task means,
  and closes tasks as the work finishes.

Two things get in the way today.

1. **There are no projects.** vQuip has 38 open tasks. About 31 fall into five
   projects that exist only in the task notes. Ten tasks say "AWS cost roadmap #N"
   by hand. Five repeat the same Kibana design doc path. The shared context gets
   copied into every task, and grouping depends on Claude reading every note.
2. **The due date does two jobs.** Some due dates are deadlines. Others mean
   "don't touch this until then" (VQ-290: snapshots tagged DeleteAfter=2027-01-12;
   VQ-326: verify after the 11/6 patch). Sorting by due date puts the wrong things
   in front of him.

## Goals

- A **project** concept: belongs to one company, holds the context that its tasks
  share, and has any number of tasks. Tasks can also have no project.
- A **"don't show before" date** on tasks (`notBefore`), separate from the deadline.
- A **morning walk** tool: one MCP call that returns the company's open tasks in
  the order Claude should walk them.
- **Every Claude session learns the new rules automatically** through the
  Conductor MCP server's instructions, with no per-repo setup.
- A small **project tag on task cards** in the UI.

## Non-goals

- Project pages, a project list screen, or project editing in the UI.
- Mapping Linear's own projects onto Conductor projects.
- Task ordering or dependencies inside a project ("do A before B").
- Hiding `notBefore` tasks in the UI board or Today cockpit. v1 applies it to the
  walk only.
- Having Conductor's local model (Qwen) pick projects. See "Who picks projects".
- Bringing back an end-of-day reset.

## Anti-goals (would make this a failure even if it works)

- **Project sprawl.** Twenty one-task projects is a messier board, not a better one.
- **A stale board.** If tasks don't get closed, tomorrow's walk opens with work
  already done and Josh stops trusting it. This is how the UI lost him.
- **Rules that drift.** The same rules copied into five places, slowly disagreeing.
- **Counts and guilt.** The walk never says "you have 6 overdue items." The
  no-badge, no-counts rules in `CLAUDE.md` apply to what Claude says, too.
- **A heavy always-on prompt.** The server instructions load into every session in
  every repo. They must stay short.

## Current state (checked 2026-10-22)

- `Task` (`prisma/schema.prisma`): `priority` is `"normal" | "urgent"`, `status` is
  `backlog | in_progress | in_review | blocked | icebox`, plus `dueDate`,
  `scheduledFor` (today's plan), `blockedReason`, `blockedAt`. No project, no
  start date.
- MCP route `src/app/api/mcp/[transport]/route.ts`: 11 tools. The server sends
  **no** `instructions` today (`serverInfo` + `capabilities` only, ~line 577).
  The installed SDK (`@modelcontextprotocol/sdk` 1.26.0) supports
  `instructions`, and `mcp-handler` 1.1.0 passes extra server options through
  to `McpServer`.
- `list_tasks` orders by role priority + `sortOrder` and caps at 50 rows. It does
  not order by urgency or due date.
- `create_task` uses the local model to infer the company when no role is given.
- Skills: `conductor`, `log-meeting`, and `start` live in
  `~/projects/jtmg/command-center-boilerplate/.claude/skills/` and are linked into
  `~/.claude/skills/`. Five repos also carry **committed copies** of all three
  (identical to the boilerplate today): `vquip-command-center`,
  `react-health-command-center`, and three clones of `core-web-defense-hub`
  (`defensehub-deploy`, `defensehub-v5`, `defensehub-sentry-fix`). A session in
  those repos loads the repo copy, so every copy must match.
- The end-of-day reset is gone (`AppShell.tsx` ~line 93). `scheduledFor` now
  persists until someone clears it, so an old "today" date stays set.
- `~/.claude/CLAUDE.md` has a long "Conductor" section that repeats tool behavior.
- No unit test runner in the repo (no `test` script, no `*.test.ts`).

## Design

### 1. The `Project` model

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `roleId` | → Role | One company per project |
| `name` | string | Unique per role. How Josh and Claude refer to it: "AWS cost" |
| `goal` | string? | One line: what the project is for |
| `doneWhen` | string? | What "finished" means for the whole project |
| `links` | string[] (Json) | Paths or URLs to the spec, plan, repo, audit docs. **Pointers, not copies.** |
| `status` | `active` \| `done` | `done` projects disappear from listings |
| `createdAt`, `updatedAt` | | |

`Task` gets `projectId String?` → `Project`, `onDelete: SetNull`, and an index on
`(projectId, done)`. A task's project must belong to the same role as the task.
Moving a task to another role (`update_task` with `role`) clears its project unless
a new one in the new role is given.

**Links, not copies.** The project points at the spec in the command center. It
does not paste its contents. A copy goes stale the day the spec changes. Claude
reads the linked file when it needs to explain a task.

**Referring to a project.** By name, resolved the same way `resolveRole` resolves
roles: exact match first, then case-insensitive, then partial, always scoped to one
role. If a partial match hits two projects, error with both names. No project key
like `VQ-P3`. (Claude's call: names are what Josh says out loud. Keys can come later.)

### 2. `notBefore` on tasks

`Task.notBefore DateTime? @db.Date`. Meaning: "don't bring this up before this
day." It does not change the due date. A task can have both.

- The walk leaves a task out until `notBefore <= today`. On the day it arrives,
  the walk flags it as newly available.
- Claude sets it explicitly through `create_task` / `update_task` when the text says
  "after X", "not before X", "once X lands on <date>". The local refiner is not
  changed in v1. (Claude's call: Claude Code has the context to tell a deadline
  from a wait date. The local model does not.)

### 3. Who picks projects

**Claude Code, in the command center session. Never the Conductor server.**

The server takes a project name and checks it exists in that role. It never infers
one. Why: the session has the meeting transcript and the command center files. The
local model has neither. Tasks filed with no Claude session (Siri shortcut, the Todo
app) land with no project, which is fine.

The log-meeting flow becomes:

1. Claude reads the Granola meeting.
2. Claude calls `list_projects` for the company.
3. Claude shows the proposed tasks, each with its project, e.g. "3 go to AWS cost,
   1 to Ops chat, 1 doesn't fit. Looks like a new project, 'Marin integration.'
   Create it?"
4. Josh confirms or corrects.
5. Claude creates any new project, then the tasks with `project` set.

**When to offer a new project (decided):** only when 2+ tasks share a goal, or the
work has a spec or repo behind it. One-off tasks stay loose.

### 4. MCP tool changes

New tools:

| Tool | Input | Does |
|---|---|---|
| `list_projects` | `role` (required), `includeDone?` | Active projects with `name`, `goal`, `doneWhen`, `links`, and each project's open task keys |
| `create_project` | `role`, `name`, `goal?`, `doneWhen?`, `links?` | Creates it. Errors if the name already exists in that role |
| `update_project` | `role`, `project`, `name?`, `goal?`, `doneWhen?`, `links?`, `done?` | Edits it. `done: true` **refuses** if open tasks remain and returns their keys, so Claude asks Josh what to do with them |
| `get_today_walk` | `role?` | The morning walk (section 5) |

Changed tools:

- `create_task`: adds `project?` and `notBefore?`. `project` requires a resolved
  role. Unknown project → error listing that role's projects (task not created).
- `update_task`: adds `project?` (`null` removes it) and `notBefore?` (`null` clears).
- `list_tasks`: adds `project?` filter. A `project` filter lifts the 50-row cap for
  that call.
- `taskShape`: adds `project` (name or null) and `notBefore`.
- `search`: builder's call whether project names/goals are searched.

### 5. The morning walk — `get_today_walk`

The **server** computes the order, not each session. Why: every command center then
walks in the same order, and fixing the order is one code change.

Put the ordering in a pure function (e.g. `src/lib/today-walk.ts`,
`buildWalk(tasks, today)`) so it can be tested without a database.

Input: open tasks (`done = false`, status not `icebox`) for the role. If `role` is
omitted, every company, grouped by role priority.

Excluded from the main walk:

- `notBefore > today`
- `status = blocked`, except ones blocked 3+ days (same rule as
  `BLOCKED_STALE_DAYS` in `TodayCockpit.tsx`). Those come back in a separate
  `blockedCheckIn` list with their `blockedReason`.
- `status = in_review` goes in a separate `waitingOnReview` list.

Main walk sections, in order. **Each task appears once, in the first section it
matches.** Flags carry the rest (an urgent task that is also past due sits in
`urgent` with `pastDue: true`).

| # | Section | Rule |
|---|---|---|
| 1 | `urgent` | `priority = urgent` |
| 2 | `pastDue` | `dueDate < today`, or `scheduledFor < today` (put on an earlier day's plan and never finished). Marked `checkFirst: true` |
| 3 | `today` | `dueDate = today`, or `scheduledFor = today` |
| 4 | `thisWeek` | `dueDate` within the next 7 days |
| 5 | `inProgress` | `status = in_progress` |
| 6 | `rest` | Everything else, grouped by project (projects A→Z, loose tasks last) |

Inside a section: by `dueDate` (soonest first, none last), then `createdAt`.

Each entry is the normal `taskShape` plus `project` and flags: `pastDue`,
`newlyAvailable` (`notBefore` within the last 3 days, so a weekend or a skipped
walk doesn't swallow it), `blockedDays` where relevant. The response
also includes each referenced project's `goal` and `links` once, so Claude can
explain tasks without another call.

No counts in the response's prose fields. Claude never leads with a number.

### 6. How sessions learn this

Four places. Each has one job.

| Layer | Carries | Reaches |
|---|---|---|
| **MCP server `instructions`** (new) | The rules, below | Every session with Conductor connected, automatically |
| **Tool descriptions** | When to call each tool ("call `list_projects` first, pass `project`") | Every session |
| **`conductor` + `log-meeting` skills** | Step-by-step flows (the propose-and-confirm list) | The boilerplate copy, plus every committed copy (see Current state) |
| **`~/.claude/CLAUDE.md`** | Shrinks to a pointer: "Conductor's server instructions are the source of truth" | Every session |

The rules live in the server instructions, because they ship in the same code as
the tools and can't drift from them. Keep them under ~300 words. Draft:

> Conductor is Josh's task system. Each company is a role. Tasks can belong to a
> project inside a role.
> - **Morning walk:** for "what's up today" or similar, call `get_today_walk` for the
>   company you're working in. Walk it in order, one task at a time. Ask about
>   `pastDue` tasks first as "did this happen?": done, new date, or still to do.
>   Never lead with counts.
> - **Projects:** you pick the project. Call `list_projects` before filing tasks.
>   Show Josh each task with its project before creating. Offer a new project only
>   when 2+ tasks share a goal or there's a spec or repo behind it.
> - **Projects hold context.** Put the goal and spec links on the project, not in
>   every task's notes. Read a project's links when explaining its tasks.
> - **Wait dates:** if a task says "after X" or "not before X", set `notBefore`,
>   not `dueDate`.
> - **Close as you go:** when work in this session finishes a task, mark it done and
>   say so in one line ("Marking VQ-318 done"). Josh can say no.
> - **Waiting on someone else** is a follow-up (`create_followup`), never a task.

The skills get rewritten to match: `conductor` (projects, walk, close-as-you-go) and
`log-meeting` (step 3 of section 3). `start`'s routing table needs no change.

**Skill copies (decided):**

- The boilerplate is the source. A small sync script in the boilerplate copies
  `conductor`, `log-meeting`, and `start` into `vquip-command-center` and
  `react-health-command-center`. Run it after any skill edit and commit in each repo.
- One PR to `core-web-defense-hub` removes its copies. That's a vQuip work repo and
  teammates can't use Conductor. Sessions there fall back to the `~/.claude/skills`
  links. The three local clones pick it up on pull.

### 7. UI: project tag on task cards

`TaskItem.tsx` is not rendered as a card anywhere (other files import only its
constants). The chip goes on the cards Josh would actually see:

- `BoardCard` in `src/app/(app)/board/BoardPage.tsx`, fed by `/api/tasks/board`.
- The task rows in `TodayCockpit.tsx`, fed by `/api/tasks`.

Both endpoints include `project: { name }`. The detail drawer is out of scope.
No other UI changes. Follow the
existing chip styling and the CSS-variable theme rules in `CLAUDE.md`.

### 8. Backfill (one time, with Josh present)

Not a migration script. In a vQuip command center session after ship, Claude:

1. Proposes the five projects and their task assignments from the current notes
   (AWS cost roadmap, Logs / Kibana replacement, Bluefields app standard, Ops chat,
   Defense Hub). Seven tasks stay loose.
2. Proposes moving wait-until dates from `dueDate` to `notBefore` (VQ-290, VQ-326,
   VQ-289, and any others found).
3. Asks about past-due tasks (e.g. VQ-318, the 10/21 L10, still open).
4. Creates and assigns only what Josh confirms.

Other companies get projects naturally as meetings are logged.

### 9. Proof it works

- `buildWalk` covers: dedupe across sections, urgent + past-due flagging,
  `notBefore` hiding and `newlyAvailable`, blocked 3+ days resurfacing, `in_review`
  split, project grouping with loose tasks last.
- `update_project done:true` with open tasks is refused and returns their keys.
- A project from another role can't be attached to a task.
- **End-to-end:** a fresh Claude Code session in the vQuip command center, given
  only "what's up today," calls `get_today_walk` and opens with urgent tasks, with no
  extra prompting. If it doesn't, the server instructions or tool descriptions are
  wrong.

## Decided by Josh

- Projects hold context (goal, done-when, links), not just a label.
- Claude Code assigns projects during log-meeting; Josh confirms the list.
- New project only for 2+ related tasks or a spec/repo.
- Add a separate `notBefore` date.
- Claude decides how to close tasks (resolved below as close-and-tell).
- UI scope: project tag on cards only.
- Skill copies: sync into the two command centers; remove from `core-web-defense-hub`.

## Claude's calls (check these)

- Close-as-you-go: Claude marks done and says so in one line; no confirm prompt.
- Past-due tasks are asked as "did this happen?", not shown as work.
- The walk order is computed on the server, in one tool.
- Projects are referred to by name, not a key.
- Links are pointers; content is never copied into Conductor.
- Claude sets `notBefore` explicitly; the local refiner is unchanged.
- `in_review` and long-blocked tasks are split out of the main walk.
- An old `scheduledFor` (before today) counts as past due and gets "did this happen?".
- `newlyAvailable` covers the last 3 days, not exactly today.
- The project chip goes on the Board and Today cards, not the detail drawer.
- `update_project done:true` refuses while open tasks remain.
- Rules live in MCP server instructions; `~/.claude/CLAUDE.md` shrinks to a pointer.

## Left to the builder

- Migration details, index names, exact Zod schemas.
- Whether to add a test runner (vitest is the obvious fit) or test `buildWalk`
  another way.
- Whether `search` covers projects.
- Exact chip styling.
- Final wording of tool descriptions and server instructions, within the rules above
  and the ~300-word budget.
