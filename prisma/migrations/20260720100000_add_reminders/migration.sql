-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "days" INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastAckOn" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);
