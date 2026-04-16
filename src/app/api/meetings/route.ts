import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function getTodayLocal(): string {
  const now = new Date();
  const localStr = now.toLocaleString("en-US", { timeZone: process.env.TIMEZONE || "America/New_York" });
  return new Date(localStr).toISOString().split("T")[0];
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const history = searchParams.get("history") === "1";

  // Legacy path: no params → today's meetings (for AgendaStrip)
  if (!history) {
    const today = getTodayLocal();
    const meetings = await prisma.meeting.findMany({
      where: { date: today, isIgnored: false, userHidden: false },
      include: {
        role: { select: { id: true, name: true, color: true } },
        prepTask: { select: { id: true, title: true, done: true } },
      },
      orderBy: { startTime: "asc" },
    });
    return NextResponse.json(meetings);
  }

  // History mode
  const beforeParam = searchParams.get("before");
  const daysParam = parseInt(searchParams.get("days") || "30", 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;
  const roleId = searchParams.get("roleId");
  const q = (searchParams.get("q") || "").trim();
  const includeHidden = searchParams.get("includeHidden") === "1";

  // Default `before` = tomorrow (so "today + back" works); upper bound is exclusive
  const before = beforeParam || addDays(getTodayLocal(), 1);
  const from = addDays(before, -days);

  const where: Prisma.MeetingWhereInput = {
    date: { gte: from, lt: before },
    isIgnored: false,
    ...(includeHidden ? {} : { userHidden: false }),
    ...(roleId ? { roleId } : {}),
    // Title search only (Postgres array contains-match for attendees would need raw SQL).
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const meetings = await prisma.meeting.findMany({
    where,
    include: {
      role: { select: { id: true, name: true, color: true } },
      prepTask: { select: { id: true, title: true, done: true } },
    },
    orderBy: [{ date: "desc" }, { startTime: "asc" }],
  });

  // Return rows + the window boundaries so the client can page
  return NextResponse.json({
    meetings,
    range: { from, before },
    // Hint: the next "before" to fetch older
    nextBefore: from,
  });
}
