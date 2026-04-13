import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  const trimmed = (name || "").trim();
  if (!trimmed || trimmed.length > 50) {
    return NextResponse.json({ error: "Name must be 1-50 characters" }, { status: 400 });
  }

  // Check uniqueness (also enforced by DB)
  const existing = await prisma.conversation.findUnique({
    where: { roleId_name: { roleId: params.roleId, name: trimmed } },
  });
  if (existing) {
    return NextResponse.json({ error: "A thread with this name already exists" }, { status: 409 });
  }

  const thread = await prisma.conversation.create({
    data: {
      roleId: params.roleId,
      name: trimmed,
      isDefault: false,
      messages: [],
    },
  });

  return NextResponse.json({
    id: thread.id,
    name: thread.name,
    isDefault: thread.isDefault,
    messageCount: 0,
    updatedAt: thread.updatedAt,
  });
}
