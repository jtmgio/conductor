-- AlterTable: Remove unique index on roleId, add new columns
DROP INDEX "Conversation_roleId_key";

ALTER TABLE "Conversation" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'General';
ALTER TABLE "Conversation" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Mark all existing conversations as the default "General" thread
UPDATE "Conversation" SET "isDefault" = true;

-- Add composite unique constraint and index
CREATE UNIQUE INDEX "Conversation_roleId_name_key" ON "Conversation"("roleId", "name");
CREATE INDEX "Conversation_roleId_updatedAt_idx" ON "Conversation"("roleId", "updatedAt");
