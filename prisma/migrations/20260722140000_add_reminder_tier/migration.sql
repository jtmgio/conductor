-- Reminder escalation tier: "critical" escalates to a takeover if ignored; "normal" stays a gentle banner.
ALTER TABLE "Reminder" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'normal';
