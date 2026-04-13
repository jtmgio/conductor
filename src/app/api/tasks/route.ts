import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const roleId = searchParams.get("roleId");
  const today = searchParams.get("today");

  const where: Record<string, unknown> = { done: false };
  if (roleId) where.roleId = roleId;
  if (today === "true") where.isToday = true;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      role: { select: { id: true, name: true, color: true, priority: true } },
      tags: { include: { tag: true } },
    },
    orderBy: [{ role: { priority: "asc" } }, { sortOrder: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const task = await prisma.task.create({
    data: {
      roleId: body.roleId,
      title: body.title,
      priority: body.priority || "normal",
      status: body.status || "backlog",
      isToday: body.isToday || false,
      notes: body.notes,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      checklist: body.checklist,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
    },
  });
  return NextResponse.json(task);
}
