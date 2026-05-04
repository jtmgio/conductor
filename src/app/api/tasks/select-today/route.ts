import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateRebalanceCache } from "@/lib/schedule-rebalance";
import { today, parseDateOnly } from "@/lib/dates";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { taskIds, scheduledFor } = body;
  if (!Array.isArray(taskIds)) {
    return NextResponse.json({ error: "taskIds must be an array" }, { status: 400 });
  }

  const target = scheduledFor ? parseDateOnly(scheduledFor) : today();

  await prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: { scheduledFor: target },
  });

  invalidateRebalanceCache();
  return NextResponse.json({ ok: true, count: taskIds.length });
}
