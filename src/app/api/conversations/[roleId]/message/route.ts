import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { assembleContext, getConversationMessages } from "@/lib/ai-context";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(req: NextRequest, { params }: { params: { roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, attachments } = await req.json();
  if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

  const { systemPrompt, contextMessages } = await assembleContext({
    roleId: params.roleId,
    query: message,
    includeRetrieved: true,
  });

  const history = await getConversationMessages(params.roleId, 10);

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `[Context]\n${contextMessages}` },
    { role: "assistant", content: "Understood. I have the current context." },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Build user message content
  const userContent: Anthropic.ContentBlockParam[] = [];
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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const assistantText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Save to conversation
  const conv = await prisma.conversation.findUnique({ where: { roleId: params.roleId } });
  const existing = (conv?.messages as Array<Record<string, unknown>>) || [];
  const updated = [
    ...existing,
    { role: "user", content: message, timestamp: new Date().toISOString() },
    { role: "assistant", content: assistantText, timestamp: new Date().toISOString() },
  ];

  await prisma.conversation.update({
    where: { roleId: params.roleId },
    data: { messages: updated as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ response: assistantText });
}
