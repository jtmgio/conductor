import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const followUps = await prisma.followUp.findMany({
    where: { status: "waiting" },
    include: { role: { select: { id: true, name: true, color: true } } },
  });

  const stale = followUps.filter((fu) => {
    const daysSince = Math.floor((Date.now() - fu.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince >= fu.staleDays;
  });

  return NextResponse.json(stale);
}
