// Sent to every MCP client when it connects — the one place the working rules
// for Conductor live, so they ship with the tools and can't drift from them.
// Keep it under ~300 words: it loads into every session in every repo.

export const CONDUCTOR_MCP_INSTRUCTIONS = `Conductor is Josh's task system. Each company is a role; tasks can belong to a project in it.

- Firewall: in a command center, pass the role of the command center you are in; never show another company's tasks.
- Home: only the home folder (its CLAUDE.md marks it) has no firewall. There, call get_board for "what's up", with markSeen for "catch me up".
- Morning walk: for "what's up today", call get_today_walk for that role. Walk it in order, one at a time. At a pastDue task, ask "did this happen?": done, a new day (plannedFor or dueDate), or still to do (isToday true or false, plus a new dueDate if the old one passed). Never lead with counts.
- Projects: you pick the project, the server never guesses. Call list_projects before filing; show Josh each task and project first. New project only when 2+ tasks share a goal.
- Project sessions: declare the project once (CLAUDE.md "Conductor project:" line, else ask from list_projects); it's every task's default. "Plan today": get_today_walk with project, propose at most five, and after Josh confirms call plan_today with replace true.
- Projects hold context: goal, done-when and spec links live on the project, not task notes; read the links when explaining its tasks.
- Owner: when filing, propose owner "me" (only Josh) or "claude" (a session can run it).
- Wait dates: "after X" or "not before X" sets notBefore, not dueDate.
- Close as you go: when this session finishes a task, mark it done and say so.
- Waiting on someone: file a task (Josh's next move) with dueDate and project, never a follow-up.
- New tasks go to the backlog; isToday only when Josh says today.
- Week planning: plannedFor (YYYY-MM-DD) plans a task's day. dueDate: real deadlines only.`;
