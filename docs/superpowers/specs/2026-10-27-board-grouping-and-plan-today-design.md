# Board grouping, filters, and "plan today" — design

Date: 2026-10-27
Status: draft, awaiting Josh's approval
Builds on: `2026-10-22-dispatch-board-design.md` (the board), `2026-10-22-projects-design.md` (projects)

## Why

Two things came out of using the board for a day.

1. **Past seven rows, the board is a wall.** "More" shows a flat list across
   ten companies with nothing to anchor the eye. Josh: "how am I supposed to
   know which way is up?"
2. **Sessions are per project, not per company.** vQuip has four Claude Code
   sessions open at once: Defense Hub, Ops Dashboard, a NoJS CVE, and so on.
   Each one needs to answer "what do we need to get done today?" for *its*
   project, and nothing today ties a session to a project or marks the day's
   picks.

Both have the same shape: the board and the session should read the same
slice — one company, one project — and the slice should be short and ordered.

## Goals

- **Grouped board.** When the list is wider than seven rows, it reads company
  → project, loose tasks last in each company; urgent and past due first
  inside each group.
- **Filters.** Company chips, then that company's project chips. Pick vQuip →
  Defense Hub and the page shows exactly what the Defense Hub session sees.
- **Plan today, per project.** In a session: declare the project once, then
  "what do we need today?" / "plan today" proposes a short list from that
  project, Josh confirms, the picks get `isToday`. The home board's Today
  view then shows the combined day across sessions.
- Conductor supplies the ordered facts and records the picks. The session
  decides. No "planning" logic on the server.

## Non-goals

- A per-task "which session owns this" field. Sessions are ephemeral.
- Auto-creating tasks from meetings during "plan today". It picks from what
  exists; log-meeting is still how tasks get made.
- Time estimates, capacity, or hours.
- Changing the seven-row default view. It stays flat and short.
- Counts, anywhere.

## Anti-goals

- **A session that guesses its project.** Tasks landing loose or in the wrong
  project is the failure this exists to stop.
- **"Plan today" that dumps the whole project.** Specific, not everything.
- **The grouped view becoming a second kanban.** It's a reading order, not a
  workspace.

## Current state (checked 2026-10-27)

- `GET /api/board` (UI) takes only `horizon` and `owner`. The MCP `get_board`
  also takes `role` and `project`. `buildBoard` already sorts the `rest` section
  by project with loose last; the UI flattens it.
- No `/api/projects` route for the UI; `list_projects` exists on MCP only.
  `/api/roles` exists.
- `Task.scheduledFor` is "on today's plan"; `isToday: true` sets it to today.
  The walk's `today` section already includes `scheduledFor = today`, so a
  planned task shows in the board's Today view with no new field.
- The `conductor` skill has no notion of "this session's project". The
  command-center `CLAUDE.md` names the company only.
- `DispatchBoard.tsx` renders the expanded list flat. `toUi` in the board route
  drops `role.priority`, so grouping needs it added back.
- `src/lib/rollover.ts` clears `scheduledFor` on past days when `/api/schedule`
  is fetched by the web shell; MCP and `/api/board` never trigger it.

## Design

### 1. Grouped board (UI)

The default view (seven rows, `more`) is unchanged.

When expanded, or when any filter is set, rows are grouped:

```
vQuip
  Defense Hub go-live
    VQ-280  Defense Hub: switch intake …        blocked 18 days
    VQ-281  Defense Hub: turn on live emails
  AWS cost
    VQ-299  Retire insurance read replica       Oct 19
  (loose)
    VQ-341  Decide on Google Meet hardware      urgent · Oct 27
Zeta Global
  EM: WhatCounts + Kosmos
    …
```

- Company order = `Role.priority`. Project order = A→Z, loose last, as
  `buildWalk`'s `rest` already does.
- Inside a group: urgent-or-planned, past due, today (due), this week, rest;
  then due date. **Planned ranks with urgent** (decided): a task with
  `scheduledFor = today` joins the first section everywhere — the walk, the
  MCP board, and the UI — because Josh chose it this morning. `sectionFor`
  changes; the walk's tests change with it.
- Group headers are plain text in the section-label style, with the company
  color dot. No counts in headers.
- Stuck / Waiting on / In review stay as separate sections below. They are
  not grouped; they follow the filters as section 2 says.

**Implementation (Claude's call):** grouping is done client-side from the rows
the API already returns (`role.name`, `role.priority`, `project`). No server
change for grouping itself.

### 2. Filters (UI)

Two chip rows above the list:

- **Company:** All · Zeta · vQuip · HealthMe · Healthmap · Xenegrade · … in
  priority order. Only active companies.
- **Project:** appears when a company is picked: All · each active project of
  that company · Loose.

Picking a company or project implies "expanded" (the cap is for the glance,
not for a filtered read). Horizon and owner toggles stay and combine.

Server: `GET /api/board` gains `role` (role id) and `project` (project id,
or `loose` for tasks with none). Both resolve exactly — the UI picked them
from a list. With a project set, Stuck and In review follow it; Waiting on
follows the company only (follow-ups have no project). The MCP `get_board`
gets the same follow-up company filter (today it ignores `role` for them).
Horizon and owner toggles still apply on top of the filters.
`GET /api/projects?roleId=` (new, session-authed) returns a company's active
projects `{ id, name, goal }` for the chips.

Filters persist in the URL (`?role=…&project=…`) so a view can be bookmarked
or reopened. (Claude's call.)

### 3. Plan today (sessions)

**Declare the project.** The first time a session touches Conductor, the
`conductor` skill looks for a `Conductor project:` line in the repo's
`CLAUDE.md` (single-project repos set it there and are never asked). Otherwise
it asks "which project is this session on?" with the options from
`list_projects` for the command center's company, plus "none". It remembers
the answer for the session and says it back once: "This session is vQuip ·
Defense Hub." Josh can change it any time ("switch to Ops Dashboard").
(Decided: pick once; no inference.)

The session's project is the **default** for every `create_task`, not a hard
rule: `log-meeting` still proposes each action item with its own project and
Josh confirms per task. "What's left?", "what's up?", and "plan today" are
scoped to the session's project. A "none" session is company-wide: it reads
and plans the whole company, loose tasks included.

**Plan today.** Josh says "plan today", "what do we need to get done today?",
or "scaffold today" in a session:

1. The session calls `get_today_walk({ role, project })`.
2. It proposes **at most five** tasks, in this order of preference: past due
   (asked as "did this happen?" first, as the walk already does), due today,
   due this week, in progress, then whatever moves the project's `doneWhen`.
   It reads today's meetings for that company (`get_meetings`) and says if one
   of them changes the pick ("Tech Ops Standup at 1 — VQ-318 should go before
   it"). One line per task, no counts.
3. Josh says yes, or trims, or adds.
4. The session calls `plan_today({ role, taskIds: [...], replace: true })`
   once. Planning twice in a day replaces that project's plan, never the
   company's.
5. It says "Planned: VQ-280, VQ-299, VQ-318." Nothing else.

Doing this in four vQuip sessions gives four small plans; the home board's
Today view (`scheduledFor = today`) shows them together, grouped by project
if expanded.

**Server:** one new MCP tool.

| Tool | Input | Does |
|---|---|---|
| `plan_today` | `role`, `taskIds` (keys ok), `replace?: boolean` | Sets `scheduledFor = today` on each. With `replace: true`, first clears `scheduledFor` today on that role's other open tasks **in the same project(s) as the given ones** (loose picks clear loose; picks spanning two projects clear both) — never the whole company, so another project's plan is untouched. Refuses a task outside `role`. Returns the planned keys. Pure helper `planClearSet()` decides what's cleared, unit-tested. |

`get_today_walk` gains `project?` (partial name, resolved like elsewhere) so
step 1 is one call. `taskShape` already returns `scheduledFor`.

**Unplanning** is `update_task { isToday: false }`, which exists.

**Yesterday's unfinished picks** come back in the walk as past due ("did this
happen?"), which the walk already does for `scheduledFor < today`. The silent
overnight rollover in `src/lib/rollover.ts` (runs only when the web app loads
`/api/schedule`) must stop clearing `scheduledFor`, or a browser visit erases
the question the sessions are meant to ask. (Claude's call; it narrows UX rule
6 to "no summary, no guilt" — the task still isn't nagged, it's asked once.)

### 4. How sessions learn this

| Layer | Change |
|---|---|
| Server instructions | One line: "In a project session, declare the project once (ask, from list_projects), file every task under it, and answer 'plan today' with plan_today after Josh confirms at most five picks." Stays under 300 words; trim elsewhere if needed. |
| `conductor` skill | New sections: *Declare the project* (CLAUDE.md line first, then ask) and *Plan today* (the five steps). Synced by `tooling/sync-conductor-skills.sh` to vquip-command-center and react-health-command-center; DefenseHub dropped its copy on 2026-10-22. |
| Home `dispatch` skill | "what's up" unchanged. Add: "by company/project" → `get_board({ role, project })`. |
| Tool descriptions | `plan_today`, `get_today_walk.project`. |
| Repo `CLAUDE.md` | Board filters/grouping, `plan_today`, `/api/projects`. |

## Decided by Josh

- Sessions are per project; "plan today" plans one project.
- Specific, not everything: a short list.
- Board filters: company, then project; sort urgent then due date.
- Conductor holds facts and records; the session decides.
- Planned-today tasks rank with urgent, at the top, everywhere.

## Claude's calls (check these)

- Project is declared once per session: `CLAUDE.md` line if present, else ask; no inference. It's a default per task, not a hard rule.
- A "none" session is company-wide.
- `replace: true` on every plan; clears only the picks' own project(s).
- Rollover stops clearing `scheduledFor`; unfinished picks are asked, not dropped.
- Filtered Stuck/In review follow the project; Waiting on follows the company.
- "At most five" picks per plan.
- `plan_today(replace)` only clears within the same project.
- Grouping is client-side; the API returns the same rows it does today.
- Filters are by id, persisted in the URL.
- Group headers carry no counts.

## Left to the builder

- Exact chip and header styling (match the existing toggle pills and
  section labels).
- Whether `GET /api/projects` lives beside `/api/roles` or under
  `/api/roles/[id]/projects`.
- Wording of the skill sections within the rules above.
- Tests for `plan_today`'s same-project clearing (pure helper, like
  `projectIdAfterRoleChange`).
