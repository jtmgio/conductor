import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.waitingOn !== undefined) data.waitingOn = body.waitingOn;
  if (body.status !== undefined) {
    data.status = body.status;
    if (body.status === "resolved") data.resolvedAt = new Date();
  }

  const followUp = await prisma.followUp.update({ where: { id: params.id }, data });
  return NextResponse.json(followUp);
}
