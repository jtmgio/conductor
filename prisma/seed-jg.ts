import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const roles = [
    {
      id: 'zeta', name: 'Zeta', title: 'UI Director / Staff Engineer',
      platform: 'Slack', priority: 1, color: '#2563eb',
      tone: 'Technical, hands-on, IC-level. Direct and efficient. Code-focused.',
      context: 'Highest-paying role. Deep UI/frontend work. Async, no mandatory meetings.',
    },
    {
      id: 'healthmap', name: 'HealthMap', title: 'Principal UI Architect',
      platform: 'Teams', priority: 2, color: '#0d9488',
      tone: 'Architectural, strategic. Focus on system design and patterns.',
      context: 'Second highest pay. Best efficiency ratio.',
    },
    {
      id: 'vquip', name: 'vQuip', title: 'CTO (3% equity)',
      platform: 'Slack', priority: 3, color: '#7c3aed',
      tone: "Strategic, CTO-level. Delegate, don't do. Frame decisions, don't raise concerns. Use 'we' not 'I'. Direct with Cam, supportive with Gates.",
      context: 'Bluefields insurance tech. 3% equity, long-term hold. Meetings 10:30am-3pm. Three unfilled seats: QA, Architect, DevOps — absorbing this work.',
    },
    {
      id: 'healthme', name: 'HealthMe', title: 'Sr UI Engineer',
      platform: 'Slack', priority: 4, color: '#d97706',
      tone: 'Professional, collaborative. Standard senior engineer communication.',
      context: 'Mid-tier. Compress hours with Claude Code.',
    },
    {
      id: 'xenegrade', name: 'Xenegrade', title: 'Sr Engineer',
      platform: 'Slack', priority: 5, color: '#8cbf6e',
      tone: 'Minimal, efficient. Low-touch communication.',
      context: 'Low maintenance. Tail block / evening work.',
    },
    {
      id: 'reacthealth', name: 'React Health', title: 'Sr Node/NestJS Engineer',
      platform: 'Teams', priority: 6, color: '#e11d48',
      tone: 'Minimal, task-focused.',
      context: 'Lowest touch. Minimal hours. Node/NestJS backend.',
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: role,
      create: role,
    });
  }

  const vquipStaff = [
    { name: 'Cam', title: 'CEO', relationship: 'My boss. In-office.', commNotes: 'Short Slack messages. Direct, brief. Cc on client-facing.' },
    { name: 'Jake Serigne', title: 'VP Technology / Product', relationship: 'Peer. In-office with Cam. Owns product roadmap.', commNotes: 'Structured communication. Has proximity advantage.' },
    { name: 'Gates', title: 'Dev Manager', relationship: 'My direct report. Manages day-to-day dev.', commNotes: 'Supportive tone. Delegate clearly.' },
    { name: 'Trey', title: 'Project Lead', relationship: 'Reports through Gates.', commNotes: '' },
    { name: 'Luke', title: 'Project Lead', relationship: 'Reports through Gates.', commNotes: '' },
    { name: 'Sufian', title: 'QA / Help Desk', relationship: 'Newer team member.', commNotes: 'Scope role carefully.' },
    { name: 'David Serigne', title: 'Finance', relationship: 'AR/AP, budgeting.', commNotes: '' },
    { name: 'Manuel Almenara', title: 'Programs', relationship: 'Cross-functional coordination.', commNotes: '' },
    { name: 'Jack Freudenthal', title: 'Loss Control', relationship: 'Insurance operations.', commNotes: '' },
  ];

  for (const s of vquipStaff) {
    await prisma.staff.create({ data: { ...s, roleId: 'vquip' } });
  }

  for (const role of roles) {
    await prisma.conversation.upsert({
      where: { roleId: role.id },
      update: {},
      create: { roleId: role.id, messages: [] },
    });
  }

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

  // User profile
  await prisma.userProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      displayName: "JG",
      communicationStyle: `Direct and concise. No filler phrases. Uses lowercase in Slack, proper case in email.
Short sentences. Drops articles sometimes. Never says "I hope this finds you well" or "just wanted to follow up" or "per my last email."
Gets to the point immediately. Uses technical terms without over-explaining.
Comfortable with incomplete sentences when the meaning is clear.
Signs off Slack messages without a closer — just sends. Emails get a simple "- JG" or nothing.
Uses "yea" not "yeah", "thx" not "thanks" in casual Slack.
When giving direction: states the decision, then the reasoning — not the other way around.`,
      sampleMessages: "",
      globalContext: `44, Atlanta. Senior engineering professional managing 6 concurrent W2 roles simultaneously for ~15 years.
Neurodivergent — direct communication preferred, no small talk in work messages.
Married, one child, wife is SAHM. 5pm hard family cutoff.
Trains for Ironman triathlons before work (swim/bike/run).
Technical stack: React/TypeScript, Node.js, NestJS, PostgreSQL, AWS.
Uses Claude Code as primary development tool across all roles.`,
    },
  });

  // Role responsibilities and quarterly goals
  const roleUpdates = [
    {
      id: "zeta",
      responsibilities: `Title: UI Director / Staff Engineer\nAccountable for:\n- UI architecture decisions across the platform\n- Component library ownership and design system\n- Frontend technical direction and standards\n- Code review authority on all frontend PRs\n- Mentoring and technical guidance for frontend team\n- Performance optimization (Lighthouse scores, LCP, bundle size)\n- Cross-team technical alignment on UI patterns`,
      quarterlyGoals: `Q2 2026:\n1. Ship component library v2 with design system tokens\n2. Improve Lighthouse scores to 90+ across all pages\n3. Establish frontend PR review SLA (24hr turnaround)\n4. Document UI architecture decision records (ADRs)`,
    },
    {
      id: "healthmap",
      responsibilities: `Title: Principal UI Architect\nAccountable for:\n- UI architecture for patient-facing dashboards\n- Frontend platform scalability decisions\n- Design pattern library and reusable components\n- Technical mentorship for UI team\n- Performance and accessibility standards\n- Integration patterns with backend health data APIs`,
      quarterlyGoals: `Q2 2026:\n1. Migrate patient dashboard to v3 architecture\n2. Establish accessibility compliance (WCAG 2.1 AA)\n3. Reduce frontend bundle size by 30%`,
    },
    {
      id: "vquip",
      responsibilities: `Title: CTO (3% equity)\nAccountable for:\n- Full technical vision and architecture for Composer platform\n- Engineering team leadership and hiring\n- Infrastructure, security, and DevOps (absorbing unfilled DevOps seat)\n- QA strategy and quality (absorbing unfilled QA seat)\n- Technical architecture decisions (absorbing unfilled Architect seat)\n- AI/ML integration strategy\n- Vendor and tooling decisions\n- Sprint planning and technical roadmap\n- Reporting to CEO (Cam) on engineering progress`,
      quarterlyGoals: `Q2 2026:\n1. Hire and onboard QA engineer\n2. Ship O&G submission portal (Angular + Node, AI-native dev pilot)\n3. Architect DevOps pipeline (CI/CD, monitoring, alerting)\n4. Reduce Sentry error volume by 50%\n5. Present AI-native development framework to leadership`,
    },
    {
      id: "healthme",
      responsibilities: `Title: Senior UI Engineer\nAccountable for:\n- Feature development on health/wellness UI\n- Component library contributions\n- Code reviews for frontend team\n- Performance optimization\n- Cross-platform responsive implementation`,
      quarterlyGoals: `Q2 2026:\n1. Component library audit and cleanup\n2. Ship 3 major feature PRs per sprint`,
    },
    {
      id: "xenegrade",
      responsibilities: `Title: Senior Engineer\nAccountable for:\n- Feature development and bug fixes\n- Code reviews\n- Technical documentation`,
      quarterlyGoals: `Q2 2026:\n1. Clear backlog of P1 bugs\n2. Document key system architecture`,
    },
    {
      id: "reacthealth",
      responsibilities: `Title: Senior Node/NestJS Engineer\nAccountable for:\n- Backend API development (NestJS)\n- Database design and optimization (PostgreSQL)\n- SRS/SDS documentation\n- Code reviews for backend PRs\nKey contacts: Sean Simmons (coordinator), Greg (upstream)`,
      quarterlyGoals: `Q2 2026:\n1. Complete SRS/SDS document reformatting\n2. Ship LiveIntent drag-and-drop integration (PR #734)`,
    },
  ];

  for (const update of roleUpdates) {
    await prisma.role.update({
      where: { id: update.id },
      data: {
        responsibilities: update.responsibilities,
        quarterlyGoals: update.quarterlyGoals,
      },
    });
  }

  // Built-in skills
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
3. Suggested nudge message (in my voice, for the appropriate platform — Slack or Teams)
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

  console.log('Seeded successfully');
}

main().catch(console.error).finally(() => prisma.$disconnect());
