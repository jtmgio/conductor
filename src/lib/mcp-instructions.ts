// Sent to every MCP client when it connects — the one place the working rules
// for Conductor live, so they ship with the tools and can't drift from them.
// Keep it under ~300 words: it loads into every session in every repo.

export const CONDUCTOR_MCP_INSTRUCTIONS = `Conductor is Josh's task system. Each company is a role. Tasks can belong to a project inside a role.

- Firewall: in a command center, always pass the role of the command center you are in; never show another company's tasks there.
- Morning walk: for "what's up today" or similar, call get_today_walk for that role. Walk it in order, one task at a time. When you reach a pastDue task, ask "did this happen?": done (mark it done), a new date (set dueDate), or still to do (set isToday true for today or false for later, and give it a new dueDate if that has passed, so it stops coming back). Never lead with counts.
- Projects: you pick the project, the server never guesses. Call list_projects before filing tasks, and show Josh each task with its project before creating anything. Offer a new project only when 2+ tasks share a goal or there is a spec or repo behind it.
- Projects hold context. Put the goal, done-when and spec links on the project, not in every task's notes. Read a project's links when explaining its tasks.
- Wait dates: if a task says "after X" or "not before X", set notBefore, not dueDate.
- Close as you go: when work in this session finishes a task, mark it done and say so in one line ("Marking VQ-318 done"). Josh can say no.
- Waiting on someone else is a follow-up (create_followup), never a task.
- New tasks go to the backlog. Set isToday only when Josh says today.`;
