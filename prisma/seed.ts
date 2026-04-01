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
      platform: 'Slack', priority: 5, color: '#57534e',
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
    await prisma.conversation.create({
      data: { roleId: role.id, messages: [] },
    });
  }

  console.log('Seeded successfully');
}

main().catch(console.error).finally(() => prisma.$disconnect());
