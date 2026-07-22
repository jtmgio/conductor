import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/dates";

// GET — active reminders with server-computed ackedToday (avoids client tz drift)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reminders = await prisma.reminder.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  const todayTime = today().getTime();

  return NextResponse.json(
    reminders.map((r) => ({
      id: r.id,
      label: r.label,
      hour: r.hour,
      minute: r.minute,
      days: r.days,
      icon: r.icon,
      durationMin: r.durationMin,
      ackedToday: r.lastAckOn ? r.lastAckOn.getTime() === todayTime : false,
    }))
  );
}

// POST — create a reminder (Settings > System > Reminders)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const hour = Number(body?.hour);
  const minute = Number(body?.minute);
  const days = Array.isArray(body?.days) ? body.days.map(Number).filter((d: number) => d >= 0 && d <= 6) : [];

  if (!label || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59 || days.length === 0) {
    return NextResponse.json({ error: "label, hour (0-23), minute (0-59), and at least one day are required" }, { status: 400 });
  }

  const icon = typeof body?.icon === "string" ? body.icon : null;
  const durationMin = Number.isInteger(body?.durationMin) && body.durationMin > 0 ? body.durationMin : null;

  const count = await prisma.reminder.count();
  const reminder = await prisma.reminder.create({
    data: { label, hour, minute, days, sortOrder: count, icon, durationMin },
  });
  return NextResponse.json(reminder, { status: 201 });
}
