import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiKey, fetchRecentNotes, GranolaNote } from "@/lib/granola";

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(meeting|call|sync|standup|check-in|checkin|huddle|1:1|one on one)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleMatch(meetingTitle: string, granolaTitle: string): boolean {
  const a = normalize(meetingTitle);
  const b = normalize(granolaTitle);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  // Word overlap: if >50% of words match
  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  const overlap = Array.from(aWords).filter((w) => bWords.has(w)).length;
  const minLen = Math.min(aWords.size, bWords.size);
  return minLen > 0 && overlap / minLen >= 0.5;
}

export async function GET(req: NextRequest) {
  const meetingId = req.nextUrl.searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId required" }, { status: 400 });
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

  // Fetch notes from the last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let notes: GranolaNote[];
  try {
    notes = await fetchRecentNotes(apiKey, since);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Get already-imported Granola sourceIds
  const existingTranscripts = await prisma.transcript.findMany({
    where: { sourceType: "granola" },
    select: { sourceId: true },
  });
  const importedIds = new Set(existingTranscripts.map((t) => t.sourceId));

  // Filter out already-imported notes
  const unimported = notes.filter((n) => !importedIds.has(`granola-${n.id}`));

  // Try auto-match by title + date
  let match: GranolaNote | null = null;
  for (const note of unimported) {
    const noteDate = new Date(note.created_at).toISOString().slice(0, 10);
    if (noteDate !== meeting.date) continue;
    if (titleMatch(meeting.title, note.title)) {
      match = note;
      break;
    }
  }

  return NextResponse.json({
    match,
    unimported: unimported.map((n) => ({
      id: n.id,
      title: n.title,
      summary: n.summary,
      created_at: n.created_at,
      folder: n.folder?.name || n.folder_membership?.[0]?.name || null,
    })),
  });
}
