import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentBlock, getNextBlocks, getTimeLabel, getOffClockMessage } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const current = getCurrentBlock(now);
  const next = getNextBlocks(3, now);
  const offClockMessage = getOffClockMessage(now);

  const roles = await prisma.role.findMany({ select: { id: true, name: true, title: true, color: true } });
  const roleMap = Object.fromEntries(roles.map((r) => [r.id, r]));

  return NextResponse.json({
    currentBlock: current
      ? {
          id: current.block.id,
          label: current.block.label,
          timeLabel: getTimeLabel(current.block),
          roleId: current.roleId,
          roleName: current.roleId ? roleMap[current.roleId]?.name : null,
          roleColor: current.roleId ? roleMap[current.roleId]?.color : null,
          roleTitle: current.roleId ? roleMap[current.roleId]?.title : null,
        }
      : null,
    nextBlocks: next.map((n) => ({
      id: n.block.id,
      label: n.block.label,
      timeLabel: getTimeLabel(n.block),
      roleId: n.roleId,
      roleName: n.roleId ? roleMap[n.roleId]?.name : null,
      roleColor: n.roleId ? roleMap[n.roleId]?.color : null,
      roleTitle: n.roleId ? roleMap[n.roleId]?.title : null,
    })),
    offClockMessage,
  });
}
