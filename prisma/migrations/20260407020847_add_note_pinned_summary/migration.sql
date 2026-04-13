-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "summary" TEXT;

-- CreateIndex
CREATE INDEX "Note_roleId_pinned_idx" ON "Note"("roleId", "pinned");
