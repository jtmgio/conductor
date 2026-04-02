-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "roleId" TEXT,
    "endpoint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_roleId_idx" ON "AiUsage"("roleId");
