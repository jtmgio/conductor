-- Human-addressable task keys: per-company prefix + monotonic number (VQ-14),
-- or an upstream system's own key (Linear's MED-54).

ALTER TABLE "Role" ADD COLUMN "taskPrefix" TEXT;
ALTER TABLE "Role" ADD COLUMN "taskSeq" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Role_taskPrefix_key" ON "Role"("taskPrefix");

ALTER TABLE "Task" ADD COLUMN "number" INTEGER;
ALTER TABLE "Task" ADD COLUMN "externalKey" TEXT;

-- Backfill: number every existing task per company in creation order, then set
-- each company's counter to its high-water mark so new tasks continue the run.
UPDATE "Task" t
SET "number" = s.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "roleId" ORDER BY "createdAt", id) AS rn
  FROM "Task"
) s
WHERE t.id = s.id;

UPDATE "Role" r
SET "taskSeq" = COALESCE((SELECT MAX(t."number") FROM "Task" t WHERE t."roleId" = r.id), 0);

-- Adopt Linear's own identifier as the key, and strip the "MED-54: " prefix the
-- sync used to jam into the title so a synced task has one identity, not two.
UPDATE "Task"
SET "externalKey" = substring(title from '^([A-Z][A-Z0-9]*-[0-9]+): '),
    title = regexp_replace(title, '^[A-Z][A-Z0-9]*-[0-9]+: ', '')
WHERE "sourceType" = 'linear'
  AND title ~ '^[A-Z][A-Z0-9]*-[0-9]+: ';

CREATE UNIQUE INDEX "Task_roleId_number_key" ON "Task"("roleId", "number");
