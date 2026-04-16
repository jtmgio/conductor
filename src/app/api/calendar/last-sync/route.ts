import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  // Return the most recent calendar sync regardless of status so the UI
  // can toast for both successes and failures.
  const lastSync = await prisma.syncLog.findFirst({
    where: { type: "calendar" },
    orderBy: { startedAt: "desc" },
    select: {
      status: true,
      startedAt: true,
      completedAt: true,
      summary: true,
      errorMessage: true,
      itemsFound: true,
      itemsCreated: true,
      itemsUpdated: true,
    },
  });

  // Use completedAt for success (signals data is ready), startedAt for failures.
  const timestamp =
    lastSync?.completedAt?.toISOString() ??
    lastSync?.startedAt?.toISOString() ??
    null;

  return NextResponse.json({
    lastSyncAt: timestamp,
    status: lastSync?.status ?? null,
    summary: lastSync?.summary ?? null,
    errorMessage: lastSync?.errorMessage ?? null,
    itemsFound: lastSync?.itemsFound ?? null,
    itemsCreated: lastSync?.itemsCreated ?? null,
    itemsUpdated: lastSync?.itemsUpdated ?? null,
  });
}
