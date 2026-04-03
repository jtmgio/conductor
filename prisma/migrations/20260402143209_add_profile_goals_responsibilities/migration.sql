-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "quarterlyGoals" TEXT,
ADD COLUMN     "responsibilities" TEXT;

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "displayName" TEXT NOT NULL DEFAULT 'JG',
    "communicationStyle" TEXT,
    "sampleMessages" TEXT,
    "globalContext" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);
