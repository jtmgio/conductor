-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "attendees" TEXT[],
    "isIgnored" BOOLEAN NOT NULL DEFAULT false,
    "prepTaskId" TEXT,
    "followUpNotes" TEXT,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_prepTaskId_key" ON "Meeting"("prepTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_sourceId_key" ON "Meeting"("sourceId");

-- CreateIndex
CREATE INDEX "Meeting_date_isIgnored_idx" ON "Meeting"("date", "isIgnored");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_prepTaskId_fkey" FOREIGN KEY ("prepTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
