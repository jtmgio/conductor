-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "summary" TEXT,
    "errorMessage" TEXT,
    "itemsFound" INTEGER,
    "itemsCreated" INTEGER,
    "itemsUpdated" INTEGER,
    "itemsSkipped" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncLog_type_createdAt_idx" ON "SyncLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SyncLog_createdAt_idx" ON "SyncLog"("createdAt");
