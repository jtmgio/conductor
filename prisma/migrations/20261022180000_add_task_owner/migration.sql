-- Who does a task: Josh ("me") or a Claude Code session ("claude").
ALTER TABLE "Task" ADD COLUMN "owner" TEXT NOT NULL DEFAULT 'me';
-- When the home board was last marked seen; drives "catch me up".
ALTER TABLE "UserProfile" ADD COLUMN "lastBoardAt" TIMESTAMP(3);
