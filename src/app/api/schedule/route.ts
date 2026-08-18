import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScheduleBlocks, getTimeLabel, getOffClockMessage, timeToMinutes, minutesToTime, localNow } from "@/lib/schedule";
import { rebalanceBlocks } from "@/lib/schedule-rebalance";
import { prisma } from "@/lib/prisma";

/** Where "open time" runs to when nothing else is scheduled — the end of the on-clock day. */
const OPEN_TIME_END_MIN = 17 * 60;

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

  // Blocks don't cover the whole working day — you start before the first one and keep
  // going after the last. Rather than showing "off the clock · nobody expects you" while
  // you're plainly working with open tasks, fall through to the priority waterfall: the
  // highest-priority company that still has work. Same rule a block with no role assigned
  // already follows, applied to the edges of the day.
  if (!currentBlock && !offClockMessage) {
    const withWork = await prisma.task.groupBy({
      by: ["roleId"],
      where: { done: false, status: { not: "icebox" } },
      _count: true,
    });
    const roleIdsWithWork = new Set(withWork.map((c) => c.roleId));
    const waterfallRole = (
      await prisma.role.findMany({
        where: { active: true },
        orderBy: { priority: "asc" },
        select: { id: true },
      })
    ).find((r) => roleIdsWithWork.has(r.id));

    if (waterfallRole) {
      // Runs until the next scheduled block, or to the end of the working day.
      const nextStart = allBlocks
        .map((b) => timeToMinutes(b.startHour, b.startMinute))
        .filter((m) => m > currentMinutes)
        .sort((a, b) => a - b)[0];
      const endMinutes = nextStart ?? OPEN_TIME_END_MIN;
      const startTime = minutesToTime(Math.min(currentMinutes, endMinutes));
      const endTime = minutesToTime(Math.max(endMinutes, currentMinutes + 1));

      currentBlock = {
        id: "open-time",
        label: "Open time",
        startHour: startTime.hour,
        startMinute: startTime.minute,
        endHour: endTime.hour,
        endMinute: endTime.minute,
        sortOrder: -1,
        dayAssignments: { [String(dayOfWeek)]: waterfallRole.id },
      };
      currentRoleId = waterfallRole.id;
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
