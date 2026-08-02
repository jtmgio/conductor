-- Comms-cover: sweep tracking to replace the anxiety patrol with a scheduled, visible sweep.

-- Fast-path read: last completed comms sweep (UTC instant) on the singleton profile.
ALTER TABLE "UserProfile" ADD COLUMN "lastSweepAt" TIMESTAMP(3);

-- Append-only history of completed sweeps.
CREATE TABLE "SweepLog" (
    "id" TEXT NOT NULL,
    "sweptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SweepLog_pkey" PRIMARY KEY ("id")
);
