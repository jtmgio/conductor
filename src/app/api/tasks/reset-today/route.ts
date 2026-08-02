import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateRebalanceCache } from "@/lib/schedule-rebalance";
import { today } from "@/lib/dates";

// Clears today's plan so the user can rebuild it: unschedules tasks scheduled
// for today and clears UserProfile.lastPlannedFor so the planning picker
// re-appears in FocusView. Also thaws icebox on Mondays.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = today();

  const ops: Promise<unknown>[] = [
    prisma.task.updateMany({
      where: { scheduledFor: { lte: target }, done: false },
      data: { scheduledFor: null },
    }),
    prisma.userProfile.upsert({
      where: { id: "default" },
      update: { lastPlannedFor: null },
      create: { id: "default", lastPlannedFor: null },
    }),
  ];

  if (new Date().getDay() === 1) {
    ops.push(
      prisma.task.updateMany({
        where: { status: "icebox", done: false },
        data: { status: "backlog" },
      })
    );
  }

  const results = await Promise.all(ops);
  const unscheduled = (results[0] as { count: number }).count;
  const thawed = results[2] ? (results[2] as { count: number }).count : 0;

  invalidateRebalanceCache();
  return NextResponse.json({ ok: true, unscheduled, thawed });
}
