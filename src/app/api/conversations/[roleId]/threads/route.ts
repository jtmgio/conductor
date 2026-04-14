import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, taskId } = await req.json();

  // If taskId provided, check for existing task thread first
  if (taskId) {
    const existingTaskThread = await prisma.conversation.findFirst({
      where: { taskId, roleId: params.roleId },
    });
    if (existingTaskThread) {
      const msgs = (existingTaskThread.messages as unknown[]) || [];
      return NextResponse.json({
        id: existingTaskThread.id,
        name: existingTaskThread.name,
        isDefault: existingTaskThread.isDefault,
        messageCount: msgs.length,
        updatedAt: existingTaskThread.updatedAt,
      });
    }
  }

  const trimmed = (name || "").trim();
  if (!trimmed || trimmed.length > 50) {
    return NextResponse.json({ error: "Name must be 1-50 characters" }, { status: 400 });
  }

  // Check uniqueness — append short ID for task threads to avoid collisions
  let threadName = trimmed;
  const existing = await prisma.conversation.findUnique({
    where: { roleId_name: { roleId: params.roleId, name: threadName } },
  });
  if (existing) {
    if (!taskId) {
      return NextResponse.json({ error: "A thread with this name already exists" }, { status: 409 });
    }
    // For task threads, append short ID to avoid name collision
    threadName = `${trimmed.slice(0, 40)} (${taskId.slice(-6)})`;
  }

  const thread = await prisma.conversation.create({
    data: {
      roleId: params.roleId,
      name: threadName,
      isDefault: false,
      messages: [],
      ...(taskId ? { taskId } : {}),
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
