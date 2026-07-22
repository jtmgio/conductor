import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/dates";

// POST — acknowledge a reminder for today (marks it taken; hides until tomorrow)
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await prisma.reminder.update({
      where: { id: params.id },
      data: { lastAckOn: today() },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
