import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const lastSync = await prisma.syncLog.findFirst({
    where: { type: "calendar", status: "success" },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });

  return NextResponse.json({
    lastSyncAt: lastSync?.completedAt?.toISOString() ?? null,
  });
}
