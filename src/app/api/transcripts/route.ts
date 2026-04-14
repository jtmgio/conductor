import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

async function generateAndSaveSummary(transcriptId: string, rawText: string, roleName: string, roleId: string) {
  try {
    const response = await createCompletion({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: "You summarize meeting transcripts concisely. Include: key topics discussed, decisions made, action items with owners, open questions, and important context. Be thorough but concise — aim for 300-500 words. Use bullet points.",
      messages: [{
        role: "user",
        content: `Summarize this meeting transcript for the ${roleName} role. Capture everything important:\n\n${rawText}`,
      }],
    });

    trackUsage("summarize", response.model, response.usage, roleId);

    await prisma.transcript.update({
      where: { id: transcriptId },
      data: { summary: response.text },
    });
  } catch {
    // Summary generation is best-effort — don't break anything
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pending = req.nextUrl.searchParams.get("pending") === "true";

  const transcripts = await prisma.transcript.findMany({
    where: pending ? { processedAt: null } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { role: { select: { id: true, name: true, color: true } } },
  });

  return NextResponse.json(transcripts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roleId, rawText, summary } = await req.json();
  if (!roleId || !rawText) {
    return NextResponse.json({ error: "roleId and rawText required" }, { status: 400 });
  }

  const transcript = await prisma.transcript.create({
    data: { roleId, rawText, summary },
  });

  // Create a Note for the transcript so it can be discussed in AI chat
  let noteId: string | undefined;
  if (rawText.length > 50) {
    try {
      const note = await prisma.note.create({
        data: {
          roleId,
          content: `[Transcript: ${new Date().toLocaleDateString()}][TranscriptID: ${transcript.id}]\n\n${rawText.slice(0, 50000)}`,
          tags: ["transcript"],
        },
      });
      noteId = note.id;
    } catch {
      // Non-critical
    }
  }

  // Generate summary in the background if not provided
  if (!summary && rawText.length > 500) {
    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
    generateAndSaveSummary(transcript.id, rawText, role?.name || "unknown", roleId);
  }

  return NextResponse.json({ ...transcript, noteId });
}
