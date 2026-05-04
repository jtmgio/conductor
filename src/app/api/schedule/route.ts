import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScheduleBlocks, getTimeLabel, getOffClockMessage, timeToMinutes, localNow } from "@/lib/schedule";
import { rebalanceBlocks } from "@/lib/schedule-rebalance";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseBlocks = await getScheduleBlocks();
  const d = localNow();
  const dayOfWeek = d.getDay();
  const currentMinutes = timeToMinutes(d.getHours(), d.getMinutes());
  const offClockMessage = getOffClockMessage();

  // Rebalance: skip roles with no tasks, expand remaining blocks
  const allBlocks = await rebalanceBlocks(baseBlocks, dayOfWeek);

  const roles = await prisma.role.findMany({ where: { active: true }, select: { id: true, name: true, title: true, color: true, platform: true } });
  const roleMap = Object.fromEntries(roles.map((r) => [r.id, r]));

  // Find current block from rebalanced schedule
  let currentBlock: typeof allBlocks[number] | null = null;
  let currentRoleId: string | null = null;
  for (const block of allBlocks) {
    const start = timeToMinutes(block.startHour, block.startMinute);
    const end = timeToMinutes(block.endHour, block.endMinute);
    if (currentMinutes >= start && currentMinutes < end) {
      const roleId = block.dayAssignments[String(dayOfWeek)];
      if (roleId) {
        currentBlock = block;
        currentRoleId = roleId;
        break;
      }
    }
  }

  // Find next blocks from rebalanced schedule
  const nextBlocks: Array<{ block: typeof allBlocks[number]; roleId: string }> = [];
  for (const block of allBlocks) {
    const start = timeToMinutes(block.startHour, block.startMinute);
    if (start > currentMinutes) {
      const roleId = block.dayAssignments[String(dayOfWeek)];
      if (roleId) {
        nextBlocks.push({ block, roleId });
        if (nextBlocks.length >= 3) break;
      }
    }
  }

  const mapBlock = (b: typeof allBlocks[number], roleId: string | null) => ({
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
  });

  return NextResponse.json({
    currentBlock: currentBlock ? mapBlock(currentBlock, currentRoleId) : null,
    nextBlocks: nextBlocks.map((n) => mapBlock(n.block, n.roleId)),
    offClockMessage,
    allBlocks: allBlocks.map((b) => {
      const roleId = b.dayAssignments[String(dayOfWeek)];
      return mapBlock(b, roleId || null);
    }),
  });
}
