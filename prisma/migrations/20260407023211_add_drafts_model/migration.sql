-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "recipientName" TEXT,
    "platform" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Draft_roleId_status_idx" ON "Draft"("roleId", "status");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
