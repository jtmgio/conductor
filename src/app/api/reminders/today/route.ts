import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dayOf, today } from "@/lib/dates";
import { hasBearer } from "@/lib/bearer";
import { remindersForToday, weekdayOf } from "@/lib/reminders-today";

export const dynamic = "force-dynamic";

/**
 * Today's reminders for the Todo.app daemon. Bearer-authed like /api/meetings/today,
 * with absolute `dueAt` instants so the Mac never does timezone math.
 */
export async function GET(req: Request) {
  if (!hasBearer(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tz = process.env.TIMEZONE || "America/New_York";
  const date = dayOf(new Date());
  const rows = await prisma.reminder.findMany({ where: { active: true } });
  return NextResponse.json({ date, reminders: remindersForToday(rows, date, weekdayOf(date), tz, today()) });
}
