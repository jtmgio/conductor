import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const staff = await prisma.staff.findMany({ where: { roleId: params.id } });
  return NextResponse.json(staff);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const staff = await prisma.staff.create({
    data: {
      roleId: params.id,
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
