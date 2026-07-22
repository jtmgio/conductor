import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommsCoverPayload } from "@/lib/comms-cover";

// POST — record a completed comms sweep. Resets the strip to "covered" and logs it.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const blockId = typeof body?.blockId === "string" ? body.blockId : null;

  await prisma.userProfile.update({
    where: { id: "default" },
    data: { lastSweepAt: new Date() },
  });
  await prisma.sweepLog.create({ data: { blockId } });

  return NextResponse.json(await getCommsCoverPayload());
}
