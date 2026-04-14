import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.isToday !== undefined) data.isToday = body.isToday;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.checklist !== undefined) data.checklist = body.checklist;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.done !== undefined) {
    data.done = body.done;
    if (body.done) data.doneAt = new Date();
  }
  if (body.status !== undefined) {
    const validStatuses = ["backlog", "in_progress", "in_review", "blocked"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }

  await prisma.task.update({ where: { id: params.id }, data });

  if (body.tags !== undefined) {
    const tagRecords = await Promise.all(
      (body.tags as string[]).map((name: string) =>
        prisma.tag.upsert({
          where: { name: name.toLowerCase().trim() },
          update: {},
          create: { name: name.toLowerCase().trim() },
        })
      )
    );
    await prisma.taskTag.deleteMany({ where: { taskId: params.id } });
    if (tagRecords.length > 0) {
      await prisma.taskTag.createMany({
        data: tagRecords.map((tag) => ({ taskId: params.id, tagId: tag.id })),
      });
    }
  }

  const updated = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      role: { select: { id: true, name: true, color: true, priority: true } },
      tags: { include: { tag: true } },
      files: { include: { file: { select: { id: true, filename: true, mimeType: true, size: true, createdAt: true } } } },
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
