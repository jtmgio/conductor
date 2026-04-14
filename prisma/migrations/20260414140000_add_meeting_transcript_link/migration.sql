-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "transcriptId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_transcriptId_key" ON "Meeting"("transcriptId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;
