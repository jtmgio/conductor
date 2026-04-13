import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { roleId: string; threadId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.conversation.findUnique({ where: { id: params.threadId } });
  if (!thread || thread.roleId !== params.roleId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: thread.id,
    name: thread.name,
    isDefault: thread.isDefault,
    messages: thread.messages,
    updatedAt: thread.updatedAt,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { roleId: string; threadId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.conversation.findUnique({ where: { id: params.threadId } });
  if (!thread || thread.roleId !== params.roleId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (thread.isDefault) {
    return NextResponse.json({ error: "Cannot rename the default thread" }, { status: 403 });
  }

  const { name } = await req.json();
  const trimmed = (name || "").trim();
  if (!trimmed || trimmed.length > 50) {
    return NextResponse.json({ error: "Name must be 1-50 characters" }, { status: 400 });
  }

  try {
    const updated = await prisma.conversation.update({
      where: { id: params.threadId },
      data: { name: trimmed },
    });
    return NextResponse.json({ id: updated.id, name: updated.name });
  } catch {
    return NextResponse.json({ error: "A thread with this name already exists" }, { status: 409 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { roleId: string; threadId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.conversation.findUnique({ where: { id: params.threadId } });
  if (!thread || thread.roleId !== params.roleId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (thread.isDefault) {
    return NextResponse.json({ error: "Cannot delete the default thread" }, { status: 403 });
  }

  await prisma.conversation.delete({ where: { id: params.threadId } });
  return NextResponse.json({ ok: true });
}
