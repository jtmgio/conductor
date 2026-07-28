import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBlock } from "@/lib/schedule";
import { today } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * Work you've already committed to that belongs to a company OTHER than the one
 * in focus right now.
 *
 * Why this exists: Focus shows a single company, and companies with little or no
 * block time (Wris has none) simply never appear. Two-thirds of the work slipping
 * through was sitting in companies the cockpit structurally could not display.
 *
 * Deliberately narrow — this is the one place cross-company work reaches the Focus
 * screen, so it must not become a dumping ground:
 *  - committed only: overdue, or scheduled for today or earlier. Never raw backlog.
 *  - the current block's company is excluded (already on screen)
 *  - most urgent first, so the three the UI shows by default are the right three
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await getCurrentBlock();
  const currentRoleId = current?.roleId ?? null;
  const start = today();

  const tasks = await prisma.task.findMany({
    where: {
      done: false,
      status: { not: "icebox" },
      ...(currentRoleId ? { roleId: { not: currentRoleId } } : {}),
      OR: [{ dueDate: { lt: start } }, { scheduledFor: { lte: start } }],
    },
    include: { role: { select: { id: true, name: true, color: true, taskPrefix: true } } },
    orderBy: [{ dueDate: "asc" }, { role: { priority: "asc" } }, { createdAt: "asc" }],
    take: 25,
  });

  const isOverdue = (d: Date | null) => !!d && d < start;

  return NextResponse.json(
    tasks
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        number: t.number,
        externalKey: t.externalKey,
        dueDate: t.dueDate,
        scheduledFor: t.scheduledFor,
        overdue: isOverdue(t.dueDate),
        role: t.role,
      }))
      // Overdue first; Prisma's nulls-last ordering already handles the rest.
      .sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0))
  );
}
