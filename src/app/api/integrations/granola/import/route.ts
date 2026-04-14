import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiKey, fetchNoteWithTranscript, buildTranscriptContent } from "@/lib/granola";

export async function POST(req: NextRequest) {
  const { granolaId, meetingId } = await req.json();

  if (!granolaId || !meetingId) {
    return NextResponse.json({ error: "granolaId and meetingId required" }, { status: 400 });
  }

  // Check dedup
  const existing = await prisma.transcript.findFirst({
    where: { sourceId: `granola-${granolaId}` },
    include: { meeting: { select: { id: true } } },
  });
  if (existing) {
    // Already imported — link to meeting if not already linked
    if (!existing.meeting) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { transcriptId: existing.id },
      }).catch(() => {});
    }
    return NextResponse.json(existing);
  }

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  let apiKey: string;
  try {
    apiKey = await getApiKey();
  } catch {
    return NextResponse.json({ error: "Granola API key not configured" }, { status: 500 });
  }

  const fullNote = await fetchNoteWithTranscript(apiKey, granolaId);
  const rawText = buildTranscriptContent(fullNote);

  const transcript = await prisma.transcript.create({
    data: {
      roleId: meeting.roleId,
      title: fullNote.title || `Meeting transcript`,
      rawText,
      summary: fullNote.summary || null,
      sourceType: "granola",
      sourceId: `granola-${granolaId}`,
      createdAt: new Date(fullNote.created_at),
    },
  });

  // Link transcript to meeting
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { transcriptId: transcript.id },
  });

  return NextResponse.json(transcript);
}
