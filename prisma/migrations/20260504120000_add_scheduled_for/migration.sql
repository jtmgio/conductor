-- Add scheduledFor (DATE) and backfill from isToday
ALTER TABLE "Task" ADD COLUMN "scheduledFor" DATE;

UPDATE "Task" SET "scheduledFor" = CURRENT_DATE WHERE "isToday" = TRUE;

-- Swap index from isToday to scheduledFor
DROP INDEX "Task_isToday_done_idx";
CREATE INDEX "Task_scheduledFor_done_idx" ON "Task"("scheduledFor", "done");

-- Drop the old boolean
ALTER TABLE "Task" DROP COLUMN "isToday";

-- Track when the user last finished planning (gates 4:45pm prompt re-firing)
ALTER TABLE "UserProfile" ADD COLUMN "lastPlannedFor" DATE;
