# Dispatch board + home session — design

Date: 2026-10-22
Status: draft, awaiting Josh's approval
Builds on: `2026-10-22-projects-design.md` (projects, `notBefore`, the morning walk)

## Why

Josh runs five companies at once and jumps between them every few minutes. He
is a dispatcher most of the day: he gauges how busy the day is, decides what to
hand to a Claude Code session, and checks back on it through the morning. He
builds no plan and works no list top to bottom. Meetings spawn new tasks and new
sessions while he works.

Conductor today is built around one company at a time:

- **Schedule blocks** give each hour to one company. He doesn't work in hours.
- **The firewall** gives each session one company. Right for the company
  windows, wrong for the person.
- **The morning walk** (`get_today_walk`) orders one company's list for working
  it top to bottom. With no role it returns every company, but grouped by
  company, so the day never shows up as one picture.

The thing he needs and doesn't have: one place that shows his next few things
across all companies, and nothing else.

## Goals

- A **home session**: one folder with no company, open all day, whose only job
  is the board.
- A **board** (`get_board`): his open tasks across every company, flat, sorted
  urgent first then by date, cut to the next few things.
- **Two kinds of task**: ones only he can do, and ones a Claude session can
  run. The board shows his. Claude's stay out of the way until one gets stuck.
- **Catch me up**: what changed since he last looked, and nothing more.
- **Hand-off** is one sentence: "give VQ-298 to a session."
- Company windows keep working exactly as they do today.

## Non-goals

- Launching or tracking Claude Code sessions. Conductor never knows which
  window has a task, only that a session is meant to run it.
- A board in the UI, or an owner chip on cards. v1 is MCP only.
- Push, notifications, or anything the board does on its own. Josh pulls.
- Changing schedule blocks or the Focus page. They stay; the board ignores them.
- Showing Claude's tasks on the board by default, even widened, unless asked
  for by owner.
- Any count, anywhere, including "and 12 more."

## Anti-goals (would make this a failure even if it works)

- **The board becomes the pool.** If "what's up" shows twenty lines, it's the UI
  all over again. Seven is the ceiling.
- **A task silently vanishes.** Hiding Claude's tasks is only safe if a stuck
  one comes back on its own. Default owner is `me` for the same reason.
- **The home session starts doing work.** It sees and decides. The moment code
  or a message is involved, that's a company window.
- **The firewall leaks.** A company window must never grow a "see everything"
  path because home exists.
- **Rules in two places.** The server instructions stay the source; the home
  skill is the step-by-step.

## Current state (checked 2026-10-22)

- `Task` has `priority`, `status` (`backlog | in_progress | in_review | blocked |
  icebox`), `dueDate`, `scheduledFor`, `notBefore`, `blockedAt`, `projectId`.
  **No owner or assignee field** (grep of schema and route: nothing).
- `get_today_walk` (`src/app/api/mcp/[transport]/route.ts` ~line 261) with no
  `role` returns `companies[]` grouped by role priority. `buildWalk()` in
  `src/lib/today-walk.ts` is pure and tested (16 tests); `sectionFor` is not
  exported.
- `UserProfile` already carries day-level state (`lastPlannedFor`,
  `lastSweepAt`, `lastRolloverOn`). Nothing records when the board was last read.
- `FollowUp` has `staleDays` (default 3); `get_context` returns waiting
  follow-ups with `daysSince`.
- Live roles and `Role.priority`: vQuip 1, Zeta Global 2, Healthmap Solutions 3,
  HealthMe 4, Wris 5, Xenegrade 6, TrainBetter.coach 7, React Health 8,
  Conductor 9, Personal 10. All active. **Josh's stated order is Zeta, vQuip,
  HealthMe, Healthmap, Xenegrade** — see "Decided by Josh" and the open question.
- Server instructions (`src/lib/mcp-instructions.ts`) are 261 words; the test
  caps them at 300.
- Command centers: `vquip-command-center`, `react-health-command-center`,
  `zeta/ux-modernization/command-center`. No folder without a company exists.
  The boilerplate `conductor` skill is linked into `~/.claude/skills`, so it
  loads in every folder, and it states the one-company firewall.

## Design

### 1. `Task.owner`

`owner String @default("me")`, values `me` | `claude`.

| Value | Meaning | On the board |
|---|---|---|
| `me` | Only Josh can do this | Yes |
| `claude` | A Claude Code session can run it | Only when stuck |

- `create_task` and `update_task` take `owner?`. `taskShape` returns it.
- **Claude proposes, Josh flips.** When `log-meeting` or a session proposes
  tasks, each line shows its owner next to its project. Josh corrects before
  anything is created.
- **Default `me`.** A task wrongly shown is noise for one glance. A task wrongly
  hidden is lost. (Claude's call.)
- Hand-off is `update_task { owner: "claude" }`. Status is untouched; the
  session that picks it up moves it to `in_progress` as it does today.

### 2. `get_board`

No `role`. Every active company. Input: open tasks (`done = false`, status not
`icebox`, `notBefore <= today`) plus waiting follow-ups.

| Input | Default | Meaning |
|---|---|---|
| `horizon` | `today` | `today` = urgent, past due, or due/planned today. `week` = adds the next 7 days. `all` = everything |
| `owner` | `me` | `me`, `claude`, or `all` |
| `role?` | — | One company (partial name ok) |
| `project?` | — | One project; needs `role` |
| `markSeen?` | `false` | Stamp `lastBoardAt` (section 3). Only "catch me up" passes `true` |

Output:

| Field | What's in it |
|---|---|
| `board` | Tasks matching the filters, **except** blocked and `in_review` ones (each task sits in one list, as in the walk). Order: urgent first, then past due, then today, then (if widened) the rest. Inside each: `dueDate` soonest first, none last; then `role.priority`; then `createdAt`. **Capped at 7 on the default view** (`BOARD_CAP`). `more: true` when the cap cut something. No number. |
| `stuck` | Any owner, so the `owner` filter doesn't apply; `role`/`project` do. Three ways in: blocked 3+ days (same rule as the walk); `owner = claude` and past due; `owner = claude` and no update in 3+ days (`updatedAt`). The third one is how a hand-off with no due date comes back. A task in `stuck` is not in `board`. |
| `waitingOnReview` | `status = in_review`. `role`/`project` filters apply. |
| `waitingOn` | Follow-ups whose `staleDays` has passed. The one proactive alert (UX rule 7). |
| `changes` | Section 3. Omitted when nothing is recorded. |

Only `board` is capped by the server. `stuck`, `waitingOnReview`, `waitingOn`
and `changes` come back whole; the home skill shows seven lines at a time and
offers "more" without a count. Why: cutting `stuck` would hide the exact tasks
the list exists to bring back.

A widened view (`horizon`, `role`, `project`, or `owner` set) is not capped: Josh
asked for it. The home skill still shows seven lines at a time and offers
"more" without a count.

Put the ordering and the cut in a pure function, `buildBoard()` in
`src/lib/board.ts`, tested like `buildWalk`. Export `sectionFor` from
`today-walk.ts` and share it, so "past due" and "today" mean the same thing on
the board and in the walk.

### 3. Catch me up

`UserProfile.lastBoardAt DateTime?`. `get_board` stamps it only when called with
`markSeen: true`, after computing. "What's up" doesn't stamp: it reads `board`
and never says `changes`, so stamping there would swallow them. Widened views
don't stamp either: a glance at "this week" isn't "I've seen everything."

`changes` is everything since `lastBoardAt`, by key, in three lists:

| List | Rule |
|---|---|
| `new` | `createdAt > lastBoardAt` |
| `nowPastDue` | Past due now, and `dueDate` or `scheduledFor` on or after `lastBoardAt`'s date |
| `nowStuck` | `blockedAt > lastBoardAt`, or `in_review` with `updatedAt > lastBoardAt` |

No "handed off" list: Josh did the hand-off himself. `in_review` uses
`updatedAt` as an approximation; a wrong hit costs one line, and a `reviewAt`
column can come later if it's noisy. Done tasks are never in `changes`.
Completed is gone (UX rule 2).

"Catch me up" in home means: call `get_board({ markSeen: true })`, say only
`changes` and `stuck`. "What's up" means: call `get_board()`, say `board`.

### 4. The home folder

`~/projects/jtmg/home`, a git repo. Not made from the full boilerplate: it needs
none of the 50 skills, the SDD pipeline, or the repo map. It holds:

- `CLAUDE.md`: "This folder has no company. You are the dispatcher. Never work a
  task here." Plus the five moves below.
- `.claude/skills/dispatch/SKILL.md`: the step-by-step for those moves.
- Nothing else. Conductor's MCP is registered at user scope, so no `.mcp.json`.

The globally linked `conductor` skill still loads here, and it states the
firewall. `CLAUDE.md` says plainly: in this folder use `dispatch`, not
`conductor`; the firewall is for company folders. The server instructions say
the same (section 6), so it holds even if `CLAUDE.md` is skimmed.

**Home is the only folder without the firewall.** Not "any folder with no
company." The conductor repo, the tower repo, and bare code repos keep the
firewall rules as they are today. The marker is the home `CLAUDE.md` naming
itself the dispatcher, and the instruction line says exactly that. The server
can't tell folders apart (one token, user scope), and `get_today_walk` with no
role already returns every company, so this was always governed by
instructions, not the server. v1 keeps it that way.

### 5. The five moves

| Josh says | Claude does |
|---|---|
| "what's up" | `get_board()`. Reads `board` one line each: key, company, title, date if any. Then stops. |
| "catch me up" | `get_board()`. Reads `changes` and `stuck`. If both are empty: "nothing new." |
| "give VQ-298 to a session" | `update_task { taskId, owner: "claude" }`. Says: "VQ-298 is marked for a session. Open the vQuip window." |
| "add a Zeta task: …" | `create_task { role: "Zeta", text }`. Home has no firewall; it passes whatever company Josh names. If he names none, `create_task` infers as today, and Claude says which company it landed in. |
| "this week" / "everything for HealthMe" / "the Venu project" / "Claude's tasks" | `get_board` with `horizon`, `role`, `project`, or `owner`. Seven lines at a time; "more" without a number. |

In the **company window**, "catch me up, what's on deck" stays the walk.
`get_today_walk` entries now carry `owner`. `owner = claude` entries are this
session's work; `owner = me` entries get asked about before Claude starts them.
Close-as-you-go marks the task done and it leaves the board.

### 6. How sessions learn this

| Layer | Change |
|---|---|
| **Server instructions** | Two lines added. Owner: "owner is me (only Josh) or claude (a session can run it); propose it when filing." Home: "only the home folder (its CLAUDE.md says it is the dispatcher) has no firewall; there, call get_board for 'what's up' and 'catch me up'." Must stay under 300 words; trim elsewhere if needed. |
| **Tool descriptions** | `get_board` says when to call it. `get_today_walk` says "in a company window." `create_task`/`update_task` mention `owner`. |
| **Home `CLAUDE.md` + `dispatch` skill** | Section 4. |
| **`conductor` skill** (boilerplate) | Walk step 2 gains the owner rule. Run `tooling/sync-conductor-skills.sh`, commit in both targets. |
| **`log-meeting` skill** | The proposed-task list shows owner next to project. Synced the same way. |
| **Repo `CLAUDE.md`** (conductor) | MCP section lists `get_board`, `owner`, and the home folder. |

### 7. Company order

The board uses `Role.priority` as the tie-break. Josh's stated order (Zeta,
vQuip, HealthMe, Healthmap, Xenegrade) does not match the stored priorities
(vQuip, Zeta, Healthmap, HealthMe, …). Fix it by changing `Role.priority`, not
with a board-only order (Claude's call: one order everywhere, no new field).
It's one SQL update, done with Josh present. Side effects: the UI's priority
waterfall and the `companies[]` order in `get_today_walk` follow it. Josh
doesn't use the UI, and the walk's company order is cosmetic.

## Decided by Josh

- He's a dispatcher most of the day. Deep-work sessions exist but he bounces
  even in those.
- One home session is the board. Company windows stay one-company.
- Writes stay per company; reading across companies happens only in home.
- The board shows only what needs him, today or sooner. Horizon plus a cap of
  about seven. No count of what's hidden.
- Tasks Claude can run stay off the board until one is stuck.
- "Catch me up" shows only what changed.
- A new folder, not this repo and not a company's.
- Company order: Zeta, vQuip, HealthMe, Healthmap, Xenegrade.

## Claude's calls (check these)

- The field is `Task.owner`, values `me` | `claude`, default `me`.
- `BOARD_CAP = 7`, applied to the default view only.
- "Stuck" = blocked 3+ days (any owner) or a Claude-owned task that's past due.
- `lastBoardAt` lives on `UserProfile`, stamped only by the default view.
- `changes` has four lists (new, nowPastDue, nowStuck, handedOff) and never
  includes done tasks.
- Home is a minimal repo with one skill, not a boilerplate clone.
- The walk gains `owner` on each entry but does not filter by it.
- Only `markSeen: true` stamps `lastBoardAt`; "what's up" never does.
- A Claude-owned task with no update in 3+ days counts as stuck, so a hand-off
  with no due date can't vanish.
- `board` excludes blocked and `in_review` tasks; a task is in one list only.
- Only `board` is capped server-side. The skill pages the rest, seven at a time.
- No `handedOff` list in `changes`.
- Home alone drops the firewall, by `CLAUDE.md` marker, enforced by
  instructions, not the server.
- Company order is a `Role.priority` change, not a board-only field.

## Left to the builder

- Whether `buildBoard` reuses `buildWalk` internally or only `sectionFor`.
- Exact Prisma queries for `changes`, and the test fixtures.
- Wording of the `dispatch` skill and the home `CLAUDE.md`, within the rules
  above.
- Whether `get_board` returns project context like the walk does. Not required;
  `list_projects` exists.
- Where the two instruction lines go and what gets trimmed to stay under 300
  words.

## Other companies (decided)

Roles beyond the five he named (Wris, TrainBetter.coach, React Health,
Conductor, Personal) are on the board too. Urgency and date decide the order;
company priority only breaks ties. An urgent Wris task shows above a plain
Zeta one. So the stored priorities need reordering (section 7) but nothing is
left out.
