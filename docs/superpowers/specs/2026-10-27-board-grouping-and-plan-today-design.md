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
- `DispatchBoard.tsx` renders the expanded list flat.

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
- Inside a group: urgent, past due, today, this week, rest; then due date.
  That's `sectionFor`; nothing new.
- Group headers are plain text in the section-label style, with the company
  color dot. No counts in headers.
- Stuck / Waiting on / In review stay as separate sections below, unchanged.

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

Server: `GET /api/board` gains `role` (role id) and `project` (project id).
Both resolve exactly, not by partial name — the UI picked them from a list.
`GET /api/projects?roleId=` (new, session-authed) returns a company's active
projects `{ id, name, goal }` for the chips.

Filters persist in the URL (`?role=…&project=…`) so a view can be bookmarked
or reopened. (Claude's call.)

### 3. Plan today (sessions)

**Declare the project.** The first time a session touches Conductor, the
`conductor` skill asks "which project is this session on?" with the options
from `list_projects` for the command center's company, plus "none / loose".
It remembers the answer for the session and says it back once: "This session
is vQuip · Defense Hub." Josh can change it any time ("switch to Ops
Dashboard"). (Decided: pick once; no inference.)

Every `create_task` from that session passes that `project`. "What's left?",
"what's up?", and "plan today" are scoped to it.

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
4. The session calls `plan_today({ role, taskIds: [...] })` once.
5. It says "Planned: VQ-280, VQ-299, VQ-318." Nothing else.

Doing this in four vQuip sessions gives four small plans; the home board's
Today view (`scheduledFor = today`) shows them together, grouped by project
if expanded.

**Server:** one new MCP tool.

| Tool | Input | Does |
|---|---|---|
| `plan_today` | `role`, `taskIds` (keys ok), `replace?: boolean` | Sets `scheduledFor = today` on each. With `replace: true`, first clears `scheduledFor` on that role's other tasks **in the same project as the given ones** — never the whole company, so another session's plan is untouched. Refuses a task outside `role`. Returns the planned keys. |

`get_today_walk` gains `project?` (partial name, resolved like elsewhere) so
step 1 is one call. `taskShape` already returns `scheduledFor`.

**Unplanning** is `update_task { isToday: false }`, which exists.

### 4. How sessions learn this

| Layer | Change |
|---|---|
| Server instructions | One line: "In a project session, declare the project once (ask, from list_projects), file every task under it, and answer 'plan today' with plan_today after Josh confirms at most five picks." Stays under 300 words; trim elsewhere if needed. |
| `conductor` skill | New sections: *Declare the project* and *Plan today* (the five steps). Synced to the two command centers. |
| Home `dispatch` skill | "what's up" unchanged. Add: "by company/project" → `get_board({ role, project })`. |
| Tool descriptions | `plan_today`, `get_today_walk.project`. |
| Repo `CLAUDE.md` | Board filters/grouping, `plan_today`, `/api/projects`. |

## Decided by Josh

- Sessions are per project; "plan today" plans one project.
- Specific, not everything: a short list.
- Board filters: company, then project; sort urgent then due date.
- Conductor holds facts and records; the session decides.

## Claude's calls (check these)

- Project is declared once per session by asking; no inference.
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
