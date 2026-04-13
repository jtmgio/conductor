import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";
import { getScheduleBlocks } from "@/lib/schedule";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Gather today's data
  const now = new Date();
  const dayOfWeek = now.getDay();

  const [todayTasks, staleFollowUps, scheduleBlocks, roles] = await Promise.all([
    prisma.task.findMany({
      where: { isToday: true, done: false },
      include: { role: { select: { name: true, color: true } } },
      orderBy: [{ priority: "desc" }, { sortOrder: "asc" }],
    }),
    prisma.followUp.findMany({
      where: {
        status: "waiting",
        createdAt: { lte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
      },
      include: { role: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    getScheduleBlocks(),
    prisma.role.findMany({
      where: { active: true },
      orderBy: { priority: "asc" },
      select: { id: true, name: true, title: true, context: true },
    }),
  ]);

  // Build schedule summary for today
  const todaySchedule = scheduleBlocks
    .map((block) => {
      const roleId = block.dayAssignments[String(dayOfWeek)];
      const role = roleId ? roles.find((r) => r.id === roleId) : null;
      const fmt = (h: number, m: number) => {
        const period = h >= 12 ? "PM" : "AM";
        const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
        return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
      };
      return `${block.label} (${fmt(block.startHour, block.startMinute)}-${fmt(block.endHour, block.endMinute)}): ${role?.name || "Unassigned"}`;
    })
    .join("\n");

  // Build task summary
  const taskSummary = todayTasks.length > 0
    ? todayTasks.map((t) => `- [${t.role.name}] ${t.title} (${t.priority})`).join("\n")
    : "No tasks selected for today yet.";

  // Build stale follow-ups summary
  const staleSummary = staleFollowUps.length > 0
    ? staleFollowUps.map((f) => {
        const days = Math.floor((now.getTime() - f.createdAt.getTime()) / (24 * 60 * 60 * 1000));
        return `- [${f.role.name}] ${f.title} — waiting on ${f.waitingOn} (${days} days)`;
      }).join("\n")
    : "No stale follow-ups.";

  const contextMessage = `Today's Tasks (${todayTasks.length}):
${taskSummary}

Stale Follow-ups (${staleFollowUps.length}):
${staleSummary}

Today's Schedule:
${todaySchedule}

Active Roles: ${roles.map((r) => `${r.name} (${r.title})`).join(", ")}`;

  const response = await createCompletion({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: "Generate a concise morning briefing for an engineer managing multiple roles. Cover: top priorities, stale items needing attention, today's schedule. Keep it under 300 words. Be direct.",
    messages: [{ role: "user", content: contextMessage }],
  });

  trackUsage("briefing", response.model, response.usage);

  return NextResponse.json({
    briefing: response.text,
    generatedAt: now.toISOString(),
  });
}
