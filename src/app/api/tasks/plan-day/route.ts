import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateRebalanceCache } from "@/lib/schedule-rebalance";
import { parseDateOnly } from "@/lib/dates";

/**
 * Atomic submit for the planning picker. Schedules selected tasks for the
 * target date, clears scheduledFor for unchecked auto-picks, and (optionally)
 * sets UserProfile.lastPlannedFor — which is the explicit "Done" signal that
 * gates the 4:45pm prompt from re-firing.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { targetDate, selectedIds = [], unscheduleIds = [], setLastPlannedFor = false } = body;

  const target = parseDateOnly(targetDate);
  if (!target) {
    return NextResponse.json({ error: "targetDate (YYYY-MM-DD) required" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.task.updateMany({
      where: { id: { in: selectedIds } },
      data: { scheduledFor: target },
    }),
    prisma.task.updateMany({
      where: { id: { in: unscheduleIds } },
      data: { scheduledFor: null },
    }),
    ...(setLastPlannedFor
      ? [
          prisma.userProfile.upsert({
            where: { id: "default" },
            update: { lastPlannedFor: target },
            create: { id: "default", lastPlannedFor: target },
          }),
        ]
      : []),
  ]);

  invalidateRebalanceCache();
  return NextResponse.json({
    ok: true,
    scheduled: selectedIds.length,
    unscheduled: unscheduleIds.length,
  });
}
