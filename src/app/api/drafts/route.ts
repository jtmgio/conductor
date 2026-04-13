import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const drafts = await prisma.draft.findMany({
    where: { status: "pending" },
    include: {
      role: { select: { id: true, name: true, color: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(drafts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.roleId || !body.content) {
    return NextResponse.json({ error: "roleId and content required" }, { status: 400 });
  }

  const draft = await prisma.draft.create({
    data: {
      roleId: body.roleId,
      recipientName: body.recipientName || null,
      platform: body.platform || null,
      content: body.content,
    },
    include: {
      role: { select: { id: true, name: true, color: true } },
    },
  });

  return NextResponse.json(draft);
}
