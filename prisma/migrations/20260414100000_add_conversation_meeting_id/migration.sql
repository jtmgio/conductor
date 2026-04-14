-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "meetingId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_meetingId_idx" ON "Conversation"("meetingId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
