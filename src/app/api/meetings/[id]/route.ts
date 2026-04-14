import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: params.id },
    include: {
      role: { select: { id: true, name: true, color: true } },
      prepTask: { select: { id: true, title: true, done: true } },
      transcript: { select: { id: true, title: true, rawText: true, summary: true, sourceId: true, processedAt: true } },
    },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(meeting);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { roleId, meetingNoteId, aiPrepContent } = await req.json();

  const data: Record<string, string> = {};
  if (roleId) data.roleId = roleId;
  if (meetingNoteId) data.meetingNoteId = meetingNoteId;
  if (aiPrepContent !== undefined) data.aiPrepContent = aiPrepContent;

  const meeting = await prisma.meeting.update({
    where: { id: params.id },
    data,
  });

  // Also update the linked prep task's role
  if (roleId && meeting.prepTaskId) {
    await prisma.task.update({
      where: { id: meeting.prepTaskId },
      data: { roleId },
    });
  }

  return NextResponse.json(meeting);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const meeting = await prisma.meeting.findUnique({ where: { id: params.id } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete linked prep task
  if (meeting.prepTaskId) {
    await prisma.task.delete({ where: { id: meeting.prepTaskId } }).catch(() => {});
  }

  await prisma.meeting.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
