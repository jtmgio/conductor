import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orderedIds } = await req.json();
  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: "orderedIds array required" }, { status: 400 });
  }

  await Promise.all(
    orderedIds.map((id: string, index: number) =>
      prisma.task.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  return NextResponse.json({ ok: true });
}
