import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayOf } from "@/lib/dates";
import { zonedInstant } from "@/lib/zoned-time";
import { hasBearer } from "@/lib/bearer";

export const dynamic = "force-dynamic";

/**
 * Today's meetings for the Todo.app meeting alert and ⌃⌥M panel. Bearer-authed like
 * /api/capture because a Swift daemon can't hold a NextAuth session.
 *
 * `startsAt`/`endsAt` are absolute instants computed here from date + HH:MM in TIMEZONE,
 * so the app never does timezone math and a laptop in another zone alerts on time.
 */
export async function GET(req: Request) {
  if (!hasBearer(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tz = process.env.TIMEZONE || "America/New_York";
  const date = dayOf(new Date());
  const rows = await prisma.meeting.findMany({
    where: { date, isIgnored: false, userHidden: false },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      joinUrl: true,
      role: { select: { name: true, color: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const meetings = rows.map(({ role, ...m }) => ({
    ...m,
    startsAt: zonedInstant(date, m.startTime, tz).toISOString(),
    endsAt: zonedInstant(date, m.endTime, tz).toISOString(),
    company: role,
  }));

  return NextResponse.json({ date, meetings });
}
