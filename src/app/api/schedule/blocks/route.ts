import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const roleCount = await prisma.role.count();
  if (roleCount > 0) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocks = await prisma.scheduleBlock.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(blocks);
}

export async function POST(req: NextRequest) {
  const roleCount = await prisma.role.count();
  if (roleCount > 0) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { label, startHour, startMinute, endHour, endMinute, dayAssignments, sortOrder } = await req.json();
  if (label === undefined || startHour === undefined || endHour === undefined) {
    return NextResponse.json({ error: "label, startHour, endHour required" }, { status: 400 });
  }

  const maxSort = await prisma.scheduleBlock.aggregate({ _max: { sortOrder: true } });

  const block = await prisma.scheduleBlock.create({
    data: {
      label,
      startHour,
      startMinute: startMinute ?? 0,
      endHour,
      endMinute: endMinute ?? 0,
      dayAssignments: dayAssignments ?? {},
      sortOrder: sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
    },
  });
  return NextResponse.json(block);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const block = await prisma.scheduleBlock.update({
    where: { id },
    data,
  });
  return NextResponse.json(block);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.scheduleBlock.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
