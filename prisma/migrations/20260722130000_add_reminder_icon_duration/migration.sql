-- Reminders become general health/routine reminders: per-item icon + optional timer.
ALTER TABLE "Reminder" ADD COLUMN "icon" TEXT;
ALTER TABLE "Reminder" ADD COLUMN "durationMin" INTEGER;
