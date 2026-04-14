-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "aiRecentNotesCount" INTEGER,
ADD COLUMN "aiRecentTranscriptsCount" INTEGER,
ADD COLUMN "aiConversationHistoryLimit" INTEGER,
ADD COLUMN "aiNoteChunkSize" INTEGER,
ADD COLUMN "aiTranscriptChunkSize" INTEGER,
ADD COLUMN "aiPinnedNoteChunkSize" INTEGER;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN "aiRecentNotesCount" INTEGER,
ADD COLUMN "aiRecentTranscriptsCount" INTEGER,
ADD COLUMN "aiConversationHistoryLimit" INTEGER,
ADD COLUMN "aiNoteChunkSize" INTEGER,
ADD COLUMN "aiTranscriptChunkSize" INTEGER,
ADD COLUMN "aiPinnedNoteChunkSize" INTEGER;
