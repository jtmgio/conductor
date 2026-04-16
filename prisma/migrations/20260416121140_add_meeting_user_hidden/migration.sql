-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "userHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Meeting_date_userHidden_idx" ON "Meeting"("date", "userHidden");
