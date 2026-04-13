import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const roleId = searchParams.get("roleId");
  if (!roleId) {
    return NextResponse.json({ error: "roleId query param required" }, { status: 400 });
  }

  // Fetch role data in parallel
  const [role, openTasks, pendingFollowUps, conversation, recentNotes] = await Promise.all([
    prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, title: true, color: true, context: true },
    }),
    prisma.task.findMany({
      where: { roleId, done: false },
      orderBy: [{ isToday: "desc" }, { priority: "desc" }, { sortOrder: "asc" }],
      take: 10,
      select: { title: true, priority: true, status: true, isToday: true },
    }),
    prisma.followUp.findMany({
      where: { roleId, status: "waiting" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { title: true, waitingOn: true, createdAt: true },
    }),
    prisma.conversation.findFirst({
      where: { roleId, isDefault: true },
      select: { messages: true },
    }),
    prisma.note.findMany({
      where: { roleId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { content: true, summary: true, createdAt: true },
    }),
  ]);

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  // Extract last 3 messages from conversation
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastMessages = (messages as any[]).slice(-3).map((m: any) => `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 200) : "[content]"}`).join("\n");

  // Build context
  const taskList = openTasks.length > 0
    ? openTasks.map((t) => `- ${t.title} (${t.priority}${t.isToday ? ", today" : ""}, ${t.status})`).join("\n")
    : "No open tasks.";

  const followUpList = pendingFollowUps.length > 0
    ? pendingFollowUps.map((f) => `- ${f.title} — waiting on ${f.waitingOn}`).join("\n")
    : "No pending follow-ups.";

  const notesSummary = recentNotes.length > 0
    ? recentNotes.map((n) => `- ${n.summary || n.content.slice(0, 100)}`).join("\n")
    : "No recent notes.";

  const contextMessage = `Role: ${role.name} (${role.title})
${role.context ? `Context: ${role.context}` : ""}

Open Tasks (${openTasks.length}):
${taskList}

Pending Follow-ups (${pendingFollowUps.length}):
${followUpList}

Recent Notes:
${notesSummary}

Last Conversation:
${lastMessages || "No recent conversation."}`;

  const response = await createCompletion({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: "Generate a brief context handoff for switching to this role. What's pending, what was last discussed, what needs attention. Keep it under 100 words.",
    messages: [{ role: "user", content: contextMessage }],
  });

  trackUsage("handoff", response.model, response.usage, roleId);

  return NextResponse.json({
    handoff: response.text,
    roleName: role.name,
    roleColor: role.color,
  });
}
