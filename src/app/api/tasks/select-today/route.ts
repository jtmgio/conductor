import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskIds } = await req.json();
  if (!Array.isArray(taskIds)) {
    return NextResponse.json({ error: "taskIds must be an array" }, { status: 400 });
  }

  await prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: { isToday: true },
  });

  return NextResponse.json({ ok: true, count: taskIds.length });
}
