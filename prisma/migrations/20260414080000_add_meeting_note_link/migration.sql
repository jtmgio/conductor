-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "meetingNoteId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_meetingNoteId_key" ON "Meeting"("meetingNoteId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_meetingNoteId_fkey" FOREIGN KEY ("meetingNoteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
