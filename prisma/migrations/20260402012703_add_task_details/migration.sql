-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
