import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    profile,
    roles,
    scheduleBlocks,
    skills,
    integrations,
    tags,
    tasks,
    taskTags,
    followUps,
    notes,
    transcripts,
    conversations,
    aiUsage,
  ] = await Promise.all([
    prisma.userProfile.findUnique({ where: { id: "default" } }),
    prisma.role.findMany({
      orderBy: { priority: "asc" },
      include: { staff: true },
    }),
    prisma.scheduleBlock.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.skill.findMany(),
    prisma.integration.findMany(),
    prisma.tag.findMany(),
    prisma.task.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.taskTag.findMany(),
    prisma.followUp.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.note.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.transcript.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.conversation.findMany(),
    prisma.aiUsage.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  // Strip internal IDs — use role names as keys for portability
  const roleIdToName: Record<string, string> = {};
  for (const r of roles) roleIdToName[r.id] = r.name;

  const exportData = {
    version: 2,
    type: "full",
    exportedAt: new Date().toISOString(),
    profile: profile
      ? {
          displayName: profile.displayName,
          communicationStyle: profile.communicationStyle,
          sampleMessages: profile.sampleMessages,
          globalContext: profile.globalContext,
          calendarIgnorePatterns: profile.calendarIgnorePatterns,
        }
      : null,
    roles: roles.map((r) => ({
      name: r.name,
      title: r.title,
      platform: r.platform,
      color: r.color,
      priority: r.priority,
      active: r.active,
      tone: r.tone,
      context: r.context,
      responsibilities: r.responsibilities,
      quarterlyGoals: r.quarterlyGoals,
      staff: r.staff.map((s) => ({
        name: s.name,
        title: s.title,
        relationship: s.relationship,
        commNotes: s.commNotes,
        email: s.email,
        slackHandle: s.slackHandle,
      })),
    })),
    scheduleBlocks: scheduleBlocks.map((b) => ({
      label: b.label,
      startHour: b.startHour,
      startMinute: b.startMinute,
      endHour: b.endHour,
      endMinute: b.endMinute,
      sortOrder: b.sortOrder,
      dayAssignments: b.dayAssignments,
    })),
    skills: skills.map((s) => ({
      name: s.name,
      label: s.label,
      description: s.description,
      icon: s.icon,
      prompt: s.prompt,
      category: s.category,
      isBuiltIn: s.isBuiltIn,
      enabled: s.enabled,
      sortOrder: s.sortOrder,
    })),
    integrations: integrations.map((i) => ({
      type: i.type,
      roleName: roleIdToName[i.roleId] || i.roleId,
      config: i.config,
      enabled: i.enabled,
      lastSyncAt: i.lastSyncAt,
      lastSyncResult: i.lastSyncResult,
    })),
    tags: tags.map((t) => ({ name: t.name, color: t.color })),
    tasks: tasks.map((t) => ({
      roleName: roleIdToName[t.roleId] || t.roleId,
      title: t.title,
      priority: t.priority,
      status: t.status,
      isToday: t.isToday,
      done: t.done,
      doneAt: t.doneAt,
      notes: t.notes,
      dueDate: t.dueDate,
      checklist: t.checklist,
      sortOrder: t.sortOrder,
      sourceType: t.sourceType,
      sourceId: t.sourceId,
      createdAt: t.createdAt,
      tags: taskTags
        .filter((tt) => tt.taskId === t.id)
        .map((tt) => {
          const tag = tags.find((tg) => tg.id === tt.tagId);
          return tag?.name || null;
        })
        .filter(Boolean),
    })),
    followUps: followUps.map((f) => ({
      roleName: roleIdToName[f.roleId] || f.roleId,
      title: f.title,
      waitingOn: f.waitingOn,
      status: f.status,
      dueDate: f.dueDate,
      staleDays: f.staleDays,
      resolvedAt: f.resolvedAt,
      sourceType: f.sourceType,
      sourceId: f.sourceId,
      createdAt: f.createdAt,
    })),
    notes: notes.map((n) => ({
      roleName: roleIdToName[n.roleId] || n.roleId,
      content: n.content,
      tags: n.tags,
      createdAt: n.createdAt,
    })),
    transcripts: transcripts.map((t) => ({
      roleName: roleIdToName[t.roleId] || t.roleId,
      rawText: t.rawText,
      summary: t.summary,
      createdAt: t.createdAt,
    })),
    conversations: conversations.map((c) => ({
      roleName: roleIdToName[c.roleId] || c.roleId,
      messages: c.messages,
    })),
    aiUsage: aiUsage.map((u) => ({
      roleName: u.roleId ? roleIdToName[u.roleId] || u.roleId : null,
      endpoint: u.endpoint,
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      costCents: u.costCents,
      createdAt: u.createdAt,
    })),
  };

  return NextResponse.json(exportData);
}
