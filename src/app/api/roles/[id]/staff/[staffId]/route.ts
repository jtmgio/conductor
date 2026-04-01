import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string; staffId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const staff = await prisma.staff.update({
    where: { id: params.staffId },
    data: {
      name: body.name,
      title: body.title,
      relationship: body.relationship,
      commNotes: body.commNotes,
      email: body.email,
      slackHandle: body.slackHandle,
    },
  });
  return NextResponse.json(staff);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; staffId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.staff.delete({ where: { id: params.staffId } });
  return NextResponse.json({ ok: true });
}
