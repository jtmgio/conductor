-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "taskId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_taskId_idx" ON "Conversation"("taskId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
