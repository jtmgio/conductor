import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roleId, tone, context } = await req.json();
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });

  const role = await prisma.role.update({
    where: { id: roleId },
    data: {
      ...(tone !== undefined && { tone }),
      ...(context !== undefined && { context }),
    },
  });

  return NextResponse.json(role);
}
