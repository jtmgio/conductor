import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Feeds the board's project chips for one company.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roleId = req.nextUrl.searchParams.get("roleId");
  if (!roleId) return NextResponse.json({ error: "roleId is required" }, { status: 400 });

  const projects = await prisma.project.findMany({
    where: { roleId, status: "active" },
    select: { id: true, name: true, goal: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(projects);
}
