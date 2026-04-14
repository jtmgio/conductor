-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "title" TEXT;
