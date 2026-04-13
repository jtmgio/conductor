import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await prisma.conversation.findMany({
    where: { roleId: params.roleId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      isDefault: true,
      messages: true,
      updatedAt: true,
    },
  });

  const defaultThread = threads.find((t) => t.isDefault);

  return NextResponse.json({
    threads: threads.map((t) => ({
      id: t.id,
      name: t.name,
      isDefault: t.isDefault,
      messageCount: Array.isArray(t.messages) ? (t.messages as unknown[]).length : 0,
      updatedAt: t.updatedAt,
    })),
    defaultThreadId: defaultThread?.id || null,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let threadId: string | undefined;
  try {
    const body = await req.json();
    threadId = body.threadId;
  } catch {
    // no body — clear default thread
  }

  if (threadId) {
    await prisma.conversation.update({
      where: { id: threadId },
      data: { messages: [] },
    });
  } else {
    const defaultThread = await prisma.conversation.findFirst({
      where: { roleId: params.roleId, isDefault: true },
    });
    if (defaultThread) {
      await prisma.conversation.update({
        where: { id: defaultThread.id },
        data: { messages: [] },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
