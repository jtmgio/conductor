-- Projects: a company's piece of work that holds the context its tasks share.
CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "goal" TEXT,
  "doneWhen" TEXT,
  "links" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Project_roleId_name_key" ON "Project"("roleId", "name");
CREATE INDEX "Project_roleId_status_idx" ON "Project"("roleId", "status");
ALTER TABLE "Project" ADD CONSTRAINT "Project_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tasks can sit in a project, and can wait until a day before they surface.
ALTER TABLE "Task" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Task" ADD COLUMN "notBefore" DATE;
CREATE INDEX "Task_projectId_done_idx" ON "Task"("projectId", "done");
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
