import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roleId = req.nextUrl.searchParams.get("roleId");
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });
  const includeDone = req.nextUrl.searchParams.get("includeDone") === "1";

  const tasks = await prisma.task.findMany({
    where: { roleId, done: false },
    include: {
      role: { select: { id: true, name: true, color: true } },
      tags: { include: { tag: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const board: Record<string, typeof tasks> = {
    backlog: tasks.filter((t) => t.status === "backlog"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    in_review: tasks.filter((t) => t.status === "in_review"),
    blocked: tasks.filter((t) => t.status === "blocked"),
  };

  if (includeDone) {
    const doneTasks = await prisma.task.findMany({
      where: { roleId, done: true },
      include: {
        role: { select: { id: true, name: true, color: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    board.done = doneTasks;
  }

  return NextResponse.json(board);
}
