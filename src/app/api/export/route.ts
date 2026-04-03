import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, roles, scheduleBlocks, skills, integrations, tags] = await Promise.all([
    prisma.userProfile.findUnique({ where: { id: "default" } }),
    prisma.role.findMany({
      orderBy: { priority: "asc" },
      include: { staff: { select: { name: true, title: true, relationship: true, commNotes: true, email: true, slackHandle: true } } },
    }),
    prisma.scheduleBlock.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.skill.findMany({ where: { isBuiltIn: false } }),
    prisma.integration.findMany(),
    prisma.tag.findMany(),
  ]);

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: profile ? {
      displayName: profile.displayName,
      communicationStyle: profile.communicationStyle,
      sampleMessages: profile.sampleMessages,
      globalContext: profile.globalContext,
      calendarIgnorePatterns: profile.calendarIgnorePatterns,
    } : null,
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
      staff: r.staff,
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
    })),
    integrations: integrations.map((i) => ({
      type: i.type,
      roleId: i.roleId,
      config: i.config,
      enabled: i.enabled,
    })),
    tags: tags.map((t) => ({ name: t.name, color: t.color })),
  };

  return NextResponse.json(exportData);
}
