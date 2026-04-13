import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const note = await prisma.note.findUnique({ where: { id: params.id } });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(note);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updateData: Record<string, unknown> = {};
  if (body.pinned !== undefined) updateData.pinned = body.pinned;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.tags !== undefined) updateData.tags = body.tags;

  const note = await prisma.note.update({
    where: { id: params.id },
    data: updateData,
  });
  return NextResponse.json(note);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.note.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
