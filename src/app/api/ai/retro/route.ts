import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [completedTasks, resolvedFollowUps, notesCreated, aiUsage, roles] = await Promise.all([
    prisma.task.findMany({
      where: { done: true, doneAt: { gte: sevenDaysAgo } },
      include: { role: { select: { id: true, name: true, color: true } } },
      orderBy: { doneAt: "desc" },
    }),
    prisma.followUp.findMany({
      where: { status: "resolved", resolvedAt: { gte: sevenDaysAgo } },
      include: { role: { select: { id: true, name: true, color: true } } },
    }),
    prisma.note.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      include: { role: { select: { id: true, name: true, color: true } } },
    }),
    prisma.aiUsage.findMany({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.role.findMany({ where: { active: true }, orderBy: { priority: "asc" } }),
  ]);

  // Group data by role
  const tasksByRole: Record<string, string[]> = {};
  for (const task of completedTasks) {
    const roleName = task.role.name;
    if (!tasksByRole[roleName]) tasksByRole[roleName] = [];
    tasksByRole[roleName].push(task.title);
  }

  const followUpsByRole: Record<string, string[]> = {};
  for (const fu of resolvedFollowUps) {
    const roleName = fu.role.name;
    if (!followUpsByRole[roleName]) followUpsByRole[roleName] = [];
    followUpsByRole[roleName].push(`${fu.title} (waiting on: ${fu.waitingOn})`);
  }

  const notesByRole: Record<string, number> = {};
  for (const note of notesCreated) {
    const roleName = note.role.name;
    notesByRole[roleName] = (notesByRole[roleName] || 0) + 1;
  }

  const totalAiCostCents = aiUsage.reduce((sum, u) => sum + u.costCents, 0);
  const totalAiCalls = aiUsage.length;

  const dataSummary = roles
    .map((role) => {
      const tasks = tasksByRole[role.name] || [];
      const followUps = followUpsByRole[role.name] || [];
      const notes = notesByRole[role.name] || 0;
      return `## ${role.name} (${role.title})
- Tasks completed: ${tasks.length}${tasks.length > 0 ? `\n  ${tasks.map((t) => `- ${t}`).join("\n  ")}` : ""}
- Follow-ups resolved: ${followUps.length}${followUps.length > 0 ? `\n  ${followUps.map((f) => `- ${f}`).join("\n  ")}` : ""}
- Notes created: ${notes}`;
    })
    .join("\n\n");

  const prompt = `Generate a weekly retrospective for an engineer managing multiple roles. Here is the data from the past 7 days:

${dataSummary}

AI usage: ${totalAiCalls} calls, $${(totalAiCostCents / 100).toFixed(2)} total cost.

Cover: what shipped per role, what's stuck, follow-up aging trends, time allocation observations, and one actionable insight for next week. Format with markdown headers per role. Keep it focused and direct.`;

  const response = await createCompletion({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  trackUsage("retro", response.model, response.usage);

  return NextResponse.json({
    retro: response.text,
    stats: {
      tasksCompleted: completedTasks.length,
      followUpsResolved: resolvedFollowUps.length,
      notesCreated: notesCreated.length,
    },
    generatedAt: new Date().toISOString(),
  });
}
