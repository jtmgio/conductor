-- CreateTable
CREATE TABLE "MeetingFile" (
    "meetingId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "MeetingFile_pkey" PRIMARY KEY ("meetingId","fileId")
);

-- CreateIndex
CREATE INDEX "MeetingFile_meetingId_idx" ON "MeetingFile"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingFile_fileId_idx" ON "MeetingFile"("fileId");

-- AddForeignKey
ALTER TABLE "MeetingFile" ADD CONSTRAINT "MeetingFile_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingFile" ADD CONSTRAINT "MeetingFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
