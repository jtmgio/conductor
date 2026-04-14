import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { assembleContext, getConversationMessages } from "@/lib/ai-context";
import { createCompletion, ALLOWED_MODELS, type AIMessage, type AIContentBlock } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export async function POST(req: NextRequest, { params }: { params: { roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, attachments, model, threadId, taskId, meetingId } = await req.json();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  // Resolve the conversation thread
  let conv;
  if (threadId) {
    conv = await prisma.conversation.findUnique({ where: { id: threadId } });
  } else if (meetingId) {
    // Find or create a meeting-scoped conversation
    conv = await prisma.conversation.findFirst({ where: { roleId: params.roleId, meetingId } });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          roleId: params.roleId,
          meetingId,
          name: `Meeting-${meetingId}`,
          isDefault: false,
          messages: [],
        },
      });
    }
  } else {
    conv = await prisma.conversation.findFirst({ where: { roleId: params.roleId, isDefault: true } });
  }
  if (!conv) return NextResponse.json({ error: "Conversation thread not found" }, { status: 404 });

  const selectedModel = ALLOWED_MODELS.includes(model) ? model : "claude-sonnet-4-6";

  const { systemPrompt, contextMessages } = await assembleContext({
    roleId: params.roleId,
    query: message,
    includeRetrieved: true,
    taskId: taskId || undefined,
  });

  // Inject meeting context if available
  let meetingContext = "";
  if (meetingId) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        meetingNote: { select: { content: true } },
        role: { select: { name: true, title: true } },
      },
    });
    if (meeting) {
      const parts = [
        `\n[MEETING CONTEXT]`,
        `Title: ${meeting.title}`,
        `Date: ${meeting.date}, ${meeting.startTime} - ${meeting.endTime}`,
      ];
      if (meeting.attendees.length > 0) parts.push(`Attendees: ${meeting.attendees.join(", ")}`);
      if (meeting.aiPrepContent) parts.push(`AI Prep:\n${meeting.aiPrepContent}`);
      if (meeting.meetingNote?.content) {
        const noteText = meeting.meetingNote.content.replace(/<[^>]+>/g, "").slice(0, 2000);
        if (noteText.trim()) parts.push(`Meeting Notes:\n${noteText}`);
      }
      meetingContext = parts.join("\n");
    }
  }

  const history = await getConversationMessages(params.roleId, 20, conv.id);

  const messages: AIMessage[] = [
    { role: "user", content: `[Context]\n${contextMessages}${meetingContext}` },
    { role: "assistant", content: "Understood. I have the current context." },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Build user message content
  const userContent: AIContentBlock[] = [];
  if (attachments?.length) {
    for (const att of attachments) {
      if (att.base64 && att.mimeType?.startsWith("image/")) {
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: att.mimeType, data: att.base64 },
        });
      } else if (att.text) {
        userContent.push({ type: "text", text: `[Attached file: ${att.filename}]\n${att.text}` });
      }
    }
  }
  userContent.push({ type: "text", text: message });
  messages.push({ role: "user", content: userContent });

  const response = await createCompletion({
    model: selectedModel,
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  });

  trackUsage("chat", response.model, response.usage, params.roleId);

  // Save to conversation
  const existing = (conv.messages as Array<Record<string, unknown>>) || [];
  let savedUserContent = message;
  if (attachments?.length) {
    const attachmentTexts = attachments
      .filter((a: { text?: string }) => a.text)
      .map((a: { filename?: string; text?: string }) => `[Attached file: ${a.filename}]\n${a.text}`);
    if (attachmentTexts.length > 0) {
      savedUserContent = attachmentTexts.join("\n\n") + "\n\n" + message;
    }
  }

  const updated = [
    ...existing,
    { role: "user", content: savedUserContent, timestamp: new Date().toISOString() },
    { role: "assistant", content: response.text, timestamp: new Date().toISOString() },
  ];

  await prisma.conversation.update({
    where: { id: conv.id },
    data: { messages: updated as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ response: response.text, threadId: conv.id });
}
