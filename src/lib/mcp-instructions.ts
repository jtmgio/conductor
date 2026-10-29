// Sent to every MCP client when it connects — the one place the working rules
// for Conductor live, so they ship with the tools and can't drift from them.
// Keep it under ~300 words: it loads into every session in every repo.

export const CONDUCTOR_MCP_INSTRUCTIONS = `Conductor is Josh's task system. Each company is a role; tasks can belong to a project in it.

- Firewall: in a command center, always pass the role of the command center you are in; never show another company's tasks.
- Home: only the home folder (its CLAUDE.md marks it) has no firewall. There, call get_board for "what's up", with markSeen for "catch me up".
- Morning walk: for "what's up today", call get_today_walk for that role. Walk it in order, one at a time. At a pastDue task, ask "did this happen?": done, a new date (set dueDate), or still to do (isToday true or false, plus a new dueDate if the old one passed). Never lead with counts.
- Projects: you pick the project, the server never guesses. Call list_projects before filing; show Josh each task and its project first. Offer a new project only when 2+ tasks share a goal.
- Project sessions: declare the project once (CLAUDE.md "Conductor project:" line, else ask from list_projects); it is the default for every task. "Plan today": get_today_walk with project, propose at most five, and after Josh confirms call plan_today with replace true.
- Projects hold context: goal, done-when and spec links go on the project, not in task notes; read the links when explaining its tasks.
- Owner: propose owner "me" (only Josh) or "claude" (a session can run it) when filing.
- Wait dates: if a task says "after X" or "not before X", set notBefore, not dueDate.
- Close as you go: when this session finishes a task, mark it done, say so in one line.
- Waiting on someone else is a follow-up (create_followup), never a task; close it with update_followup.
- New tasks go to the backlog. Set isToday only when Josh says today.`;
