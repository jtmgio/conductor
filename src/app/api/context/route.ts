import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBlock, getTimeLabel } from "@/lib/schedule";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [roles, todayTasks, followUps] = await Promise.all([
    prisma.role.findMany({
      select: { id: true, name: true, color: true, title: true },
      orderBy: { priority: "asc" },
    }),
    prisma.task.findMany({
      where: { isToday: true, done: false },
      select: { id: true, title: true, status: true, roleId: true, tags: { include: { tag: true } } },
    }),
    prisma.followUp.findMany({
      where: { status: "waiting" },
      select: { id: true, title: true, waitingOn: true, roleId: true, createdAt: true },
    }),
  ]);

  const block = await getCurrentBlock();
  const currentBlock = block
    ? { roleId: block.roleId, label: block.block.label, timeLabel: getTimeLabel(block.block) }
    : null;

  return NextResponse.json({
    roles,
    todayTasks: todayTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      roleId: t.roleId,
      tags: t.tags.map((tt) => tt.tag.name),
    })),
    followUps: followUps.map((f) => ({
      id: f.id,
      title: f.title,
      waitingOn: f.waitingOn,
      roleId: f.roleId,
      daysSince: Math.floor((Date.now() - f.createdAt.getTime()) / 86400000),
    })),
    currentBlock,
    date: new Date().toISOString().split("T")[0],
  });
}
