import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBlock } from "@/lib/schedule";
import { today, addDays } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * "Where should I go next?" — ranked companies with the reasoning shown.
 *
 * Deliberately deterministic. Impact is a judgment only the user can make, and
 * they already encode it in Role.priority; an AI guessing importance from task
 * titles would produce confident, unauditable answers. Every number below is
 * something you can point at and argue with, which is the whole value.
 *
 * Weights, highest first:
 *   overdue      12  — a missed deadline is the loudest real signal there is
 *   due today     6  — committed, still has a chance
 *   stale f/u     4  — someone else is blocked on you
 *   untouched     1/day, capped at 10 — starvation guard, the thing that let
 *                     Wris go quiet for days while louder companies ate the time
 *   priority      (11 - rank) — the user's own ordering, as a persistent tilt
 *                     rather than an override; a low-ranked company with three
 *                     late items should still win.
 */
const W = { overdue: 12, dueToday: 6, staleFollowup: 4, untouchedPerDay: 1, untouchedCap: 10 };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await getCurrentBlock();
  const start = today();
  const end = addDays(start, 1);
  const now = Date.now();

  const roles = await prisma.role.findMany({
    where: { active: true },
    select: { id: true, name: true, color: true, priority: true },
    orderBy: { priority: "asc" },
  });

  const ranked = [];
  for (const role of roles) {
    const [overdue, dueToday, waiting, lastDone] = await Promise.all([
      prisma.task.count({ where: { roleId: role.id, done: false, status: { not: "icebox" }, dueDate: { lt: start } } }),
      prisma.task.count({ where: { roleId: role.id, done: false, status: { not: "icebox" }, dueDate: { gte: start, lt: end } } }),
      prisma.followUp.findMany({ where: { roleId: role.id, status: "waiting" }, select: { createdAt: true, staleDays: true } }),
      prisma.task.findFirst({ where: { roleId: role.id, done: true }, orderBy: { doneAt: "desc" }, select: { doneAt: true } }),
    ]);
    const openCount = await prisma.task.count({
      where: { roleId: role.id, done: false, status: { not: "icebox" } },
    });
    if (openCount === 0) continue; // nothing to do there — never route to an empty company

    const staleFollowups = waiting.filter(
      (f) => Math.floor((now - f.createdAt.getTime()) / 86_400_000) >= f.staleDays
    ).length;
    const daysUntouched = lastDone?.doneAt
      ? Math.floor((now - lastDone.doneAt.getTime()) / 86_400_000)
      : W.untouchedCap;

    const score =
      overdue * W.overdue +
      dueToday * W.dueToday +
      staleFollowups * W.staleFollowup +
      Math.min(daysUntouched, W.untouchedCap) * W.untouchedPerDay +
      (11 - role.priority);

    // Human-readable "why" — the router is only trustworthy if it shows its work.
    const why: string[] = [];
    if (overdue) why.push(`${overdue} late`);
    if (dueToday) why.push(`${dueToday} due today`);
    if (staleFollowups) why.push(`${staleFollowups} waiting on someone`);
    if (daysUntouched >= 3) why.push(`untouched ${daysUntouched >= W.untouchedCap ? "10+" : daysUntouched} days`);
    if (!why.length) why.push(`${openCount} open`);

    ranked.push({
      id: role.id,
      name: role.name,
      color: role.color,
      score,
      why: why.join(" · "),
      isCurrent: role.id === current?.roleId,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return NextResponse.json({ companies: ranked, suggestion: ranked.find((r) => !r.isCurrent) ?? null });
}
