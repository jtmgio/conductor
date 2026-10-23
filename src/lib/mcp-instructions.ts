// Sent to every MCP client when it connects — the one place the working rules
// for Conductor live, so they ship with the tools and can't drift from them.
// Keep it under ~300 words: it loads into every session in every repo.

export const CONDUCTOR_MCP_INSTRUCTIONS = `Conductor is Josh's task system. Each company is a role; tasks can belong to a project in it.

- Firewall: in a command center, always pass the role of the command center you are in; never show another company's tasks there.
- Home: only the home folder (its CLAUDE.md marks it the dispatcher) has no firewall. There, call get_board for "what's up", or with markSeen for "catch me up".
- Morning walk: for "what's up today" or similar, call get_today_walk for that role. Walk it in order, one task at a time. When you reach a pastDue task, ask "did this happen?": done, a new date (set dueDate), or still to do (set isToday true for today or false for later, and give it a new dueDate if that has passed, so it stops coming back). Never lead with counts.
- Projects: you pick the project, the server never guesses. Call list_projects before filing, and show Josh each task with its project before creating it. Offer a new project only when 2+ tasks share a goal or a spec or repo backs it.
- Projects hold context: goal, done-when and spec links go on the project, not in task notes; read the links when explaining its tasks.
- Owner: owner is "me" (only Josh can do it) or "claude" (a session can run it). Propose it when filing; Josh flips it.
- Wait dates: if a task says "after X" or "not before X", set notBefore, not dueDate.
- Close as you go: when work in this session finishes a task, mark it done and say so in one line.
- Waiting on someone else is a follow-up (create_followup), never a task.
- New tasks go to the backlog. Set isToday only when Josh says today.`;
