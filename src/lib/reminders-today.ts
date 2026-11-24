import { zonedInstant } from "@/lib/zoned-time";

/**
 * Today's reminders for the Todo.app daemon (GET /api/reminders/today). Pure so the
 * weekday and timezone rules are tested; the route only supplies the clock and the rows.
 */
export interface ReminderRow {
  id: string;
  label: string;
  hour: number;
  minute: number;
  days: number[];
  active: boolean;
  lastAckOn: Date | null;
  icon: string | null;
  durationMin: number | null;
  tier: string;
}

export interface TodayReminder {
  id: string;
  label: string;
  icon: string | null;
  tier: string;
  durationMin: number | null;
  dueAt: string;
  ackedToday: boolean;
}

/** 0=Sun..6=Sat for a YYYY-MM-DD date already in TIMEZONE — never the server's clock. */
export function weekdayOf(date: string): number {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

export function remindersForToday(
  rows: ReminderRow[],
  date: string,
  weekday: number,
  timeZone: string,
  todayStart: Date,
): TodayReminder[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  return rows
    .filter((r) => r.active && r.days.includes(weekday))
    .map((r) => ({
      id: r.id,
      label: r.label,
      icon: r.icon,
      tier: r.tier,
      durationMin: r.durationMin,
      dueAt: zonedInstant(date, `${pad(r.hour)}:${pad(r.minute)}`, timeZone).toISOString(),
      ackedToday: r.lastAckOn ? r.lastAckOn.getTime() === todayStart.getTime() : false,
    }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
