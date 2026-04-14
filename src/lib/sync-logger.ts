import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type SyncType = "linear" | "granola" | "calendar";
export type SyncTrigger = "manual" | "cron" | "cron-refresh" | "app-open";

interface SyncLogEntry {
  type: SyncType;
  trigger?: SyncTrigger;
  status: "success" | "error" | "partial";
  summary?: string;
  errorMessage?: string;
  itemsFound?: number;
  itemsCreated?: number;
  itemsUpdated?: number;
  itemsSkipped?: number;
  meta?: Prisma.InputJsonValue;
  startedAt: Date;
}

export async function logSync(entry: SyncLogEntry) {
  const now = new Date();
  const durationMs = now.getTime() - entry.startedAt.getTime();

  return prisma.syncLog.create({
    data: {
      type: entry.type,
      trigger: entry.trigger || "manual",
      status: entry.status,
      summary: entry.summary,
      errorMessage: entry.errorMessage,
      itemsFound: entry.itemsFound,
      itemsCreated: entry.itemsCreated,
      itemsUpdated: entry.itemsUpdated,
      itemsSkipped: entry.itemsSkipped,
      meta: entry.meta ?? undefined,
      startedAt: entry.startedAt,
      completedAt: now,
      durationMs,
    },
  });
}
