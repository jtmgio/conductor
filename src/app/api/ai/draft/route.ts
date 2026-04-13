import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assembleContext } from "@/lib/ai-context";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";
import { ALLOWED_MODELS } from "@/lib/ai-provider";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roleId, recipientName, topic, draftType, model } = await req.json();
  if (!roleId || !topic) {
    return NextResponse.json({ error: "roleId and topic required" }, { status: 400 });
  }

  const selectedModel = ALLOWED_MODELS.includes(model) ? model : "claude-sonnet-4-6";

  const { systemPrompt, contextMessages } = await assembleContext({
    roleId,
    query: recipientName || topic,
    includeRetrieved: true,
  });

  // Look up recipient if named
  let recipientContext = "";
  if (recipientName) {
    const staff = await prisma.staff.findFirst({
      where: {
        roleId,
        name: { contains: recipientName, mode: "insensitive" },
      },
    });
    if (staff) {
      recipientContext = `\nRecipient: ${staff.name} (${staff.title}). Relationship: ${staff.relationship || "N/A"}. Comm notes: ${staff.commNotes || "N/A"}.`;
    }
  }

  const draftPrompt = `Draft a ${draftType || "message"} about: ${topic}
${recipientContext}

Generate 2-3 variants with different tones (e.g., Direct, Softer, Formal).
Return JSON: { variants: [{ label: string, text: string }] }
Keep messages concise and platform-appropriate.`;

  const response = await createCompletion({
    model: selectedModel,
    max_tokens: 2048,
    system: `${systemPrompt}\n\nContext:\n${contextMessages}\n\nYou must respond with valid JSON only, no markdown fences.`,
    messages: [{ role: "user", content: draftPrompt }],
  });

  trackUsage("draft", response.model, response.usage, roleId);

  try {
    const parsed = JSON.parse(response.text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({
      variants: [{ label: "Draft", text: response.text }],
    });
  }
}
