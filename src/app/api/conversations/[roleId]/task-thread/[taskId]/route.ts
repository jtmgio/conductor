import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { roleId: string; taskId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conv = await prisma.conversation.findFirst({
    where: { taskId: params.taskId, roleId: params.roleId },
  });

  if (!conv) {
    return NextResponse.json({ threadId: null });
  }

  const messages = (conv.messages as Array<Record<string, unknown>>) || [];
  return NextResponse.json({
    threadId: conv.id,
    name: conv.name,
    messages,
  });
}
