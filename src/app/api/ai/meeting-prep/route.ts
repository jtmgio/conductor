import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId } = await req.json();
  if (!meetingId) return NextResponse.json({ error: "meetingId required" }, { status: 400 });

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      role: { select: { id: true, name: true, title: true, context: true, responsibilities: true, quarterlyGoals: true } },
    },
  });

  if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

  // Find staff matching attendees
  const staff = meeting.attendees.length > 0
    ? await prisma.staff.findMany({
        where: {
          roleId: meeting.roleId,
          OR: meeting.attendees.map((name) => ({
            name: { contains: name.split(" ")[0], mode: "insensitive" as const },
          })),
        },
        select: { name: true, title: true, relationship: true },
      })
    : [];

  // Find stale follow-ups relevant to attendees
  const staleFollowUps = await prisma.followUp.findMany({
    where: {
      roleId: meeting.roleId,
      status: "waiting",
      createdAt: { lte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    },
    select: { title: true, waitingOn: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  // Search for prior notes related to meeting title or attendees
  const searchTerms = [meeting.title, ...meeting.attendees.slice(0, 3)];
  const relatedNotes = await prisma.note.findMany({
    where: {
      roleId: meeting.roleId,
      OR: searchTerms.map((term) => ({
        content: { contains: term.split(" ")[0], mode: "insensitive" as const },
      })),
    },
    select: { content: true, tags: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Build context
  const parts: string[] = [];

  parts.push(`Meeting: ${meeting.title}`);
  parts.push(`Time: ${meeting.startTime} - ${meeting.endTime}`);
  parts.push(`Role: ${meeting.role.name} (${meeting.role.title || ""})`);

  if (meeting.attendees.length > 0) {
    parts.push(`Attendees: ${meeting.attendees.join(", ")}`);
  }

  if (staff.length > 0) {
    parts.push("\nKnown people in this meeting:");
    for (const s of staff) {
      parts.push(`- ${s.name}${s.title ? ` (${s.title})` : ""}${s.relationship ? ` — ${s.relationship}` : ""}`);
    }
  }

  if (meeting.role.responsibilities) {
    parts.push(`\nYour responsibilities in this role: ${meeting.role.responsibilities}`);
  }
  if (meeting.role.quarterlyGoals) {
    parts.push(`Quarterly goals: ${meeting.role.quarterlyGoals}`);
  }
  if (meeting.role.context) {
    parts.push(`Role context: ${meeting.role.context}`);
  }

  if (meeting.followUpNotes) {
    parts.push(`\nPreviously flagged items for this meeting:\n${meeting.followUpNotes}`);
  }

  if (staleFollowUps.length > 0) {
    parts.push("\nOpen follow-ups with this team:");
    for (const f of staleFollowUps) {
      const days = Math.floor((Date.now() - f.createdAt.getTime()) / (24 * 60 * 60 * 1000));
      parts.push(`- ${f.title} (waiting on ${f.waitingOn}, ${days}d)`);
    }
  }

  if (relatedNotes.length > 0) {
    parts.push("\nRecent related notes:");
    for (const n of relatedNotes) {
      const snippet = n.content.replace(/<[^>]+>/g, "").slice(0, 200);
      parts.push(`- ${snippet}`);
    }
  }

  const response = await createCompletion({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `Generate meeting prep for a busy engineer. Be direct and concise. Use markdown formatting.

Include these sections:
## Context
2-3 bullet points of key context about this meeting, attendees, and your role.

## Talking Points
3-5 suggested questions or discussion items based on the context.

## Open Items
Any stale follow-ups or unresolved items to bring up with these attendees. If none, say "None identified."

Keep the total under 300 words.`,
    messages: [{ role: "user", content: parts.join("\n") }],
  });

  trackUsage("meeting_prep", response.model, response.usage);

  return NextResponse.json({
    prep: response.text,
    generatedAt: new Date().toISOString(),
  });
}
