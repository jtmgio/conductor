import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH — edit a reminder (label, time, days, active). Only provided fields change.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
  if (Number.isInteger(body.hour) && body.hour >= 0 && body.hour <= 23) data.hour = body.hour;
  if (Number.isInteger(body.minute) && body.minute >= 0 && body.minute <= 59) data.minute = body.minute;
  if (Array.isArray(body.days)) {
    const days = body.days.map(Number).filter((d: number) => d >= 0 && d <= 6);
    if (days.length > 0) data.days = days;
  }
  if (typeof body.active === "boolean") data.active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const reminder = await prisma.reminder.update({ where: { id: params.id }, data });
    return NextResponse.json(reminder);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

// DELETE — remove a reminder
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await prisma.reminder.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
