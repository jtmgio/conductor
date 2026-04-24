import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentBlock, getNextBlocks, getScheduleBlocks, getTimeLabel, getOffClockMessage } from "@/lib/schedule";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await getCurrentBlock();
  const next = await getNextBlocks(3);
  const allBlocks = await getScheduleBlocks();
  const now = new Date();
  const localStr = now.toLocaleString("en-US", { timeZone: process.env.TIMEZONE || "America/New_York" });
  const localNow = new Date(localStr);
  const dayOfWeek = localNow.getDay();
  const offClockMessage = getOffClockMessage();

  const roles = await prisma.role.findMany({ where: { active: true }, select: { id: true, name: true, title: true, color: true, platform: true } });
  const roleMap = Object.fromEntries(roles.map((r) => [r.id, r]));

  return NextResponse.json({
    currentBlock: current
      ? {
          id: current.block.id,
          label: current.block.label,
          timeLabel: getTimeLabel(current.block),
          startHour: current.block.startHour,
          startMinute: current.block.startMinute,
          endHour: current.block.endHour,
          endMinute: current.block.endMinute,
          roleId: current.roleId,
          roleName: current.roleId ? roleMap[current.roleId]?.name : null,
          roleColor: current.roleId ? roleMap[current.roleId]?.color : null,
          roleTitle: current.roleId ? roleMap[current.roleId]?.title : null,
          rolePlatform: current.roleId ? roleMap[current.roleId]?.platform : null,
        }
      : null,
    nextBlocks: next.map((n) => ({
      id: n.block.id,
      label: n.block.label,
      timeLabel: getTimeLabel(n.block),
      startHour: n.block.startHour,
      startMinute: n.block.startMinute,
      endHour: n.block.endHour,
      endMinute: n.block.endMinute,
      roleId: n.roleId,
      roleName: n.roleId ? roleMap[n.roleId]?.name : null,
      roleColor: n.roleId ? roleMap[n.roleId]?.color : null,
      roleTitle: n.roleId ? roleMap[n.roleId]?.title : null,
      rolePlatform: n.roleId ? roleMap[n.roleId]?.platform : null,
    })),
    offClockMessage,
    allBlocks: allBlocks.map((b) => {
      const roleId = b.dayAssignments[String(dayOfWeek)];
      return {
        id: b.id,
        label: b.label,
        timeLabel: getTimeLabel(b),
        startHour: b.startHour,
        startMinute: b.startMinute,
        endHour: b.endHour,
        endMinute: b.endMinute,
        roleId: roleId || null,
        roleName: roleId ? roleMap[roleId]?.name : null,
        roleColor: roleId ? roleMap[roleId]?.color : null,
        roleTitle: roleId ? roleMap[roleId]?.title : null,
        rolePlatform: roleId ? roleMap[roleId]?.platform : null,
      };
    }),
  });
}
