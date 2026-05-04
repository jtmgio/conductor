import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateRebalanceCache } from "@/lib/schedule-rebalance";

// With scheduledFor, yesterday's incomplete tasks naturally surface via the
// scheduledFor <= today query — no wipe needed at day rollover. This route
// now exists only for the Monday icebox thaw.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let thawed = 0;
  if (new Date().getDay() === 1) {
    const result = await prisma.task.updateMany({
      where: { status: "icebox", done: false },
      data: { status: "backlog" },
    });
    thawed = result.count;
  }

  invalidateRebalanceCache();
  return NextResponse.json({ ok: true, thawed });
}
