import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentBlock } from "@/lib/schedule";
import { today, addDays } from "@/lib/dates";

// Fixed list of the companies the user actively works — the all-clear only reassures
// about these (dormant/automated companies as "quiet" is meaningless noise). Matched
// as a lowercased substring so "Zeta Global" / "Healthmap Solutions" still match.
// Edit here if the active roster changes.
const ACTIVE_COMPANIES = ["vquip", "zeta", "healthmap", "healthme"];
function isActiveCompany(name: string): boolean {
  const n = name.toLowerCase();
  return ACTIVE_COMPANIES.some((a) => n.includes(a));
}

// GET — per-company "all clear" facts for every active company EXCEPT the current
// block's. `quiet` = nothing due today and no stale follow-ups. Numeric fields are
// omitted when quiet so nothing tempts the UI to render a count.
//
// Integrity rule (spec §5): this must never lie. On error we throw (500) so the
// client renders nothing rather than a false "quiet".
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await getCurrentBlock();
  const currentRoleId = current?.roleId ?? null;

  const roles = await prisma.role.findMany({
    where: { active: true },
    orderBy: { priority: "asc" },
    select: { id: true, name: true, color: true },
  });

  const start = today();
  const end = addDays(start, 1);
  const now = Date.now();

  const out = [];
  for (const role of roles) {
    if (role.id === currentRoleId) continue;
    if (!isActiveCompany(role.name)) continue;

    const dueToday = await prisma.task.count({
      where: { roleId: role.id, done: false, dueDate: { gte: start, lt: end } },
    });

    const waiting = await prisma.followUp.findMany({
      where: { roleId: role.id, status: "waiting" },
      select: { createdAt: true, staleDays: true },
    });
    const staleFollowups = waiting.filter(
      (f) => Math.floor((now - f.createdAt.getTime()) / 86_400_000) >= f.staleDays
    ).length;

    const quiet = dueToday === 0 && staleFollowups === 0;
    out.push(
      quiet
        ? { id: role.id, name: role.name, color: role.color, quiet: true }
        : { id: role.id, name: role.name, color: role.color, quiet: false, dueToday, staleFollowups }
    );
  }

  return NextResponse.json({ roles: out });
}
