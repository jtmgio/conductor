import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    taskCount,
    staffCount,
    profile,
    blocksWithRoles,
    integrationCount,
    conversationsWithMessages,
  ] = await Promise.all([
    prisma.task.count({ where: { done: false } }),
    prisma.staff.count(),
    prisma.userProfile.findUnique({ where: { id: "default" }, select: { communicationStyle: true, anthropicApiKey: true } }),
    prisma.scheduleBlock.findMany({ select: { dayAssignments: true } }),
    prisma.integration.count({ where: { enabled: true } }),
    prisma.conversation.findMany({ select: { messages: true } }),
  ]);

  const hasScheduleAssignments = blocksWithRoles.some((b) => {
    const assignments = b.dayAssignments as Record<string, string> | null;
    return assignments && Object.values(assignments).some((v) => v);
  });

  const hasApiKey = !!(profile?.anthropicApiKey || process.env.ANTHROPIC_API_KEY);

  const hasConversations = conversationsWithMessages.some((c) => {
    const msgs = c.messages as unknown[];
    return msgs && msgs.length > 0;
  });

  return NextResponse.json({
    tasks: taskCount > 0,
    staff: staffCount > 0,
    schedule: hasScheduleAssignments,
    voiceProfile: !!profile?.communicationStyle,
    apiKey: hasApiKey,
    integrations: integrationCount > 0,
    ai: hasConversations,
  });
}
