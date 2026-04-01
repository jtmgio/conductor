import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const roleId = searchParams.get("roleId");

  const where: Record<string, unknown> = {};
  if (roleId) where.roleId = roleId;

  const files = await prisma.fileUpload.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(files);
}
