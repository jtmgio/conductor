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

// Follow-ups are retired (2026-11-10): what you're waiting on is a dated task in a
// project. Existing rows stay readable and editable; nothing new gets created.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Follow-ups are retired. Create a to-do instead." },
    { status: 410 }
  );
}
