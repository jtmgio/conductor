-- Blocked tasks carry a reason and a clock, so they resurface instead of rotting.
ALTER TABLE "Task" ADD COLUMN "blockedReason" TEXT;
ALTER TABLE "Task" ADD COLUMN "blockedAt" TIMESTAMP(3);

-- Anything already blocked gets its clock started now rather than never nudging.
UPDATE "Task" SET "blockedAt" = CURRENT_TIMESTAMP WHERE status = 'blocked' AND done = false;
