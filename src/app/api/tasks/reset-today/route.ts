import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateRebalanceCache } from "@/lib/schedule-rebalance";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.task.updateMany({
    where: { isToday: true, done: false },
    data: { isToday: false },
  });

  // Monday thaw — move icebox tasks back to backlog
  let thawed = 0;
  const today = new Date();
  if (today.getDay() === 1) {
    const result = await prisma.task.updateMany({
      where: { status: "icebox", done: false },
      data: { status: "backlog" },
    });
    thawed = result.count;
  }

  invalidateRebalanceCache();
  return NextResponse.json({ ok: true, thawed });
}
