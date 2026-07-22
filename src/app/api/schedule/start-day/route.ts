import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getScheduleBlocks, invalidateScheduleCache, localNow, timeToMinutes } from "@/lib/schedule";
import { today, formatDateOnly } from "@/lib/dates";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = localNow();
  const todayDate = today();
  const todayIso = formatDateOnly(todayDate)!;

  const profile = await prisma.userProfile.findUnique({
    where: { id: "default" },
    select: { lastPlannedFor: true },
  });
  const plannedIso = profile?.lastPlannedFor ? formatDateOnly(profile.lastPlannedFor) : null;
  const planned = plannedIso === todayIso;

  if (!planned) {
    return NextResponse.json({ planned: false, targetDate: todayIso });
  }

  // Compute shift: how many minutes earlier we are than the first scheduled block today.
  invalidateScheduleCache();
  const blocks = await getScheduleBlocks(now);
  const dayOfWeek = now.getDay();
  const firstToday = blocks
    .filter((b) => b.dayAssignments[String(dayOfWeek)])
    .sort((a, b) => timeToMinutes(a.startHour, a.startMinute) - timeToMinutes(b.startHour, b.startMinute))[0];

  if (!firstToday) {
    return NextResponse.json({ planned: true, shifted: false, reason: "no-blocks-today" });
  }

  const firstStart = timeToMinutes(firstToday.startHour, firstToday.startMinute);
  const nowMinutes = timeToMinutes(now.getHours(), now.getMinutes());
  const shift = nowMinutes - firstStart;

  if (shift >= 0) {
    return NextResponse.json({ planned: true, shifted: false, reason: "already-started" });
  }

  await prisma.userProfile.upsert({
    where: { id: "default" },
    update: { dayShiftDate: todayDate, dayShiftMinutes: shift },
    create: { id: "default", dayShiftDate: todayDate, dayShiftMinutes: shift },
  });
  invalidateScheduleCache();

  return NextResponse.json({ planned: true, shifted: true, shiftMinutes: shift });
}
