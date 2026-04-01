import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q parameter required" }, { status: 400 });

  const notes = await prisma.note.findMany({
    where: { content: { contains: q, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { role: { select: { id: true, name: true } } },
  });
  return NextResponse.json(notes);
}
