import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { trackUsage } from "@/lib/ai-usage";

const anthropic = new Anthropic();

async function generateAndSaveSummary(transcriptId: string, rawText: string, roleName: string, roleId: string) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "You summarize meeting transcripts concisely. Include: key topics discussed, decisions made, action items with owners, open questions, and important context. Be thorough but concise — aim for 300-500 words. Use bullet points.",
      messages: [{
        role: "user",
        content: `Summarize this meeting transcript for the ${roleName} role. Capture everything important:\n\n${rawText}`,
      }],
    });

    trackUsage("summarize", response.model, response.usage, roleId);

    const summary = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    await prisma.transcript.update({
      where: { id: transcriptId },
      data: { summary },
    });
  } catch {
    // Summary generation is best-effort — don't break anything
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roleId, rawText, summary } = await req.json();
  if (!roleId || !rawText) {
    return NextResponse.json({ error: "roleId and rawText required" }, { status: 400 });
  }

  // Save transcript immediately
  const transcript = await prisma.transcript.create({
    data: { roleId, rawText, summary },
  });

  // Generate summary in the background if not provided
  if (!summary && rawText.length > 500) {
    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
    // Fire and forget — don't await
    generateAndSaveSummary(transcript.id, rawText, role?.name || "unknown", roleId);
  }

  return NextResponse.json(transcript);
}
