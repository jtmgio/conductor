import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Default tags
  const defaultTags = [
    { name: "frontend", color: "#2dd4bf" },
    { name: "backend", color: "#fbbf24" },
    { name: "devops", color: "#fb7185" },
    { name: "docs", color: "#a8a29e" },
    { name: "meeting", color: "#a78bfa" },
    { name: "deploy", color: "#4d8ef7" },
  ];

  for (const tag of defaultTags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: {},
      create: tag,
    });
  }

  // Empty user profile (filled during onboarding)
  await prisma.userProfile.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", displayName: "" },
  });

  // Default schedule block templates (times only, no role assignments)
  const defaultBlocks = [
    { label: "Morning", startHour: 7, startMinute: 30, endHour: 10, endMinute: 0, sortOrder: 1 },
    { label: "Triage", startHour: 10, startMinute: 0, endHour: 10, endMinute: 30, sortOrder: 2 },
    { label: "Midday", startHour: 10, startMinute: 30, endHour: 15, endMinute: 0, sortOrder: 3 },
    { label: "Afternoon", startHour: 15, startMinute: 0, endHour: 16, endMinute: 0, sortOrder: 4 },
    { label: "Late Afternoon", startHour: 16, startMinute: 0, endHour: 17, endMinute: 0, sortOrder: 5 },
    { label: "Evening", startHour: 19, startMinute: 0, endHour: 20, endMinute: 0, sortOrder: 6 },
  ];

  const existingBlocks = await prisma.scheduleBlock.count();
  if (existingBlocks === 0) {
    for (const block of defaultBlocks) {
      await prisma.scheduleBlock.create({ data: block });
    }
  }

  // Built-in skills (generic, not user-specific)
  const builtInSkills = [
    {
      name: "standup-prep",
      label: "Standup prep",
      description: "Generate standup notes for current role",
      icon: "Mic",
      category: "daily",
      sortOrder: 1,
      prompt: `Generate standup prep for my {{roleName}} role ({{roleTitle}}).

Today's tasks:
{{todayTasks}}

Recently completed (last 24h):
{{recentCompleted}}

Stale follow-ups for this role:
{{staleFollowUps}}

Format as:
- What I did yesterday (completed tasks)
- What I'm doing today (today's tasks)
- Blockers (blocked tasks + stale follow-ups)

Keep it concise — this is for a 2-minute verbal update, not a report.`,
    },
    {
      name: "weekly-summary",
      label: "Weekly summary",
      description: "Summarize completed work across all roles this week",
      icon: "Calendar",
      category: "reporting",
      sortOrder: 2,
      prompt: `Generate a weekly summary across all my roles.

Completed tasks this week:
{{weeklyCompleted}}

Follow-ups resolved this week:
{{weeklyResolved}}

Still active follow-ups:
{{activeFollowUps}}

Current quarterly goals:
{{quarterlyGoals}}

Format as a brief executive summary — what moved forward this week, what's still in progress, any concerns. Group by role. 3-4 sentences per role max.`,
    },
    {
      name: "draft-update",
      label: "Draft status update",
      description: "Draft a status update for leadership",
      icon: "Send",
      category: "drafting",
      sortOrder: 3,
      prompt: `Draft a status update for {{roleName}} ({{roleTitle}}) leadership.

My responsibilities:
{{responsibilities}}

Quarterly goals:
{{quarterlyGoals}}

Tasks in progress:
{{inProgressTasks}}

Tasks completed recently:
{{recentCompleted}}

Blocked items:
{{blockedTasks}}

Follow-ups waiting:
{{activeFollowUps}}

Write in my voice. Keep it to 4-6 bullet points. Lead with progress, then blockers. No fluff.`,
    },
    {
      name: "stale-report",
      label: "Stale report",
      description: "All stale follow-ups with nudge suggestions",
      icon: "AlertCircle",
      category: "daily",
      sortOrder: 4,
      prompt: `Review all stale follow-ups across all my roles:

{{allStaleFollowUps}}

For each one:
1. How many days stale
2. Who owes me what
3. Suggested nudge message (in my voice, for the appropriate platform)
4. Escalation risk — should I mention this to their manager?

Prioritize by staleness and business impact.`,
    },
    {
      name: "sprint-plan",
      label: "Sprint plan",
      description: "Plan next sprint from backlog",
      icon: "Target",
      category: "planning",
      sortOrder: 5,
      prompt: `Help me plan the next sprint for {{roleName}}.

Current backlog (not started):
{{backlogTasks}}

In progress:
{{inProgressTasks}}

Quarterly goals:
{{quarterlyGoals}}

Suggest which backlog items to pull into the next sprint. Prioritize based on:
1. Alignment with quarterly goals
2. Items that unblock other work
3. Quick wins that reduce backlog noise
4. Urgency

Recommend 5-8 items max for a 2-week sprint. Explain your reasoning briefly.`,
    },
    {
      name: "meeting-prep",
      label: "Meeting prep",
      description: "Prep notes for your next meeting",
      icon: "Users",
      category: "daily",
      sortOrder: 6,
      prompt: `Prepare me for my upcoming meeting.

Role: {{roleName}} ({{roleTitle}})
Today's calendar tasks:
{{calendarTasks}}

Staff directory for this role:
{{staff}}

Stale follow-ups involving people I might meet:
{{staleFollowUps}}

Recent notes and transcripts:
{{recentNotes}}

Give me:
1. Key items to bring up
2. Follow-ups to chase
3. Decisions to push for
4. One sentence on the overall priority for this meeting`,
    },
    {
      name: "role-switch",
      label: "Role context brief",
      description: "Quick context brief when switching roles",
      icon: "RefreshCw",
      category: "daily",
      sortOrder: 7,
      prompt: `I'm switching to my {{roleName}} role ({{roleTitle}}). Give me a 30-second context brief:

Today's tasks for this role:
{{roleTodayTasks}}

Active follow-ups:
{{roleFollowUps}}

Recent notes:
{{recentNotes}}

Quarterly goals:
{{quarterlyGoals}}

Tell me:
1. What's the most important thing right now?
2. Anything stale or overdue?
3. Any recent decisions or context I should remember?

Keep it tight — I need to switch contexts fast.`,
    },
    {
      name: "blocked",
      label: "Blocked items",
      description: "List blocked tasks with unblock suggestions",
      icon: "XCircle",
      category: "daily",
      sortOrder: 8,
      prompt: `Show me all blocked tasks across all roles:

{{allBlockedTasks}}

For each blocked task:
1. What's blocking it?
2. Who can unblock it?
3. What's the concrete next action to get it moving?
4. How long has it been blocked?

Suggest an order of attack — which blocked item should I tackle first?`,
    },
  ];

  for (const skill of builtInSkills) {
    await prisma.skill.upsert({
      where: { name: skill.name },
      update: { ...skill, isBuiltIn: true },
      create: { ...skill, isBuiltIn: true },
    });
  }

  console.log('Seeded successfully (clean slate — add companies via the app)');
}

main().catch(console.error).finally(() => prisma.$disconnect());
