import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.content !== undefined) data.content = body.content;
  if (body.status !== undefined) data.status = body.status;

  const draft = await prisma.draft.update({
    where: { id: params.id },
    data,
    include: {
      role: { select: { id: true, name: true, color: true } },
    },
  });

  return NextResponse.json(draft);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.draft.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
