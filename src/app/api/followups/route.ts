import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const roleId = searchParams.get("roleId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (roleId) where.roleId = roleId;
  if (status) where.status = status;

  const followUps = await prisma.followUp.findMany({
    where,
    include: { role: { select: { id: true, name: true, color: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(followUps);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const followUp = await prisma.followUp.create({
    data: {
      roleId: body.roleId,
      title: body.title,
      waitingOn: body.waitingOn,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      staleDays: body.staleDays || 3,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
    },
  });
  return NextResponse.json(followUp);
}
