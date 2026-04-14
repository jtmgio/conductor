import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const transcript = await prisma.transcript.findUnique({ where: { id: params.id } });
  if (!transcript) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(transcript);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json();
  const transcript = await prisma.transcript.update({
    where: { id: params.id },
    data: {
      ...(data.roleId !== undefined ? { roleId: data.roleId } : {}),
      ...(data.processedAt !== undefined ? { processedAt: new Date(data.processedAt) } : {}),
      ...(data.summary !== undefined ? { summary: data.summary } : {}),
    },
  });

  return NextResponse.json(transcript);
}
