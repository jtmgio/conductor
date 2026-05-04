function getTimezone(): string {
  if (typeof process !== "undefined" && process.env?.TIMEZONE) return process.env.TIMEZONE;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

const TIMEZONE = getTimezone();

/**
 * Today's calendar date in the configured timezone, returned as a UTC-midnight Date.
 * Suitable for Prisma @db.Date columns and date-only comparisons.
 */
export function today(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

export function tomorrow(): Date {
  return addDays(today(), 1);
}

/** Next working day: Friday → Monday, Saturday → Monday, otherwise +1. */
export function nextWorkingDay(from: Date = today()): Date {
  const dow = from.getUTCDay();
  if (dow === 5) return addDays(from, 3);
  if (dow === 6) return addDays(from, 2);
  return addDays(from, 1);
}

/** Parse an ISO date string (YYYY-MM-DD) as a UTC-midnight Date. Returns null if invalid. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Format a Date as YYYY-MM-DD using its UTC components (matches @db.Date storage). */
export function formatDateOnly(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True if the given date represents today (in UTC-midnight form). */
export function isToday(date: Date | null | undefined): boolean {
  if (!date) return false;
  return date.getTime() === today().getTime();
}

/** Today as YYYY-MM-DD — for sending in request bodies. */
export function todayISO(): string {
  return formatDateOnly(today())!;
}

/** Tomorrow as YYYY-MM-DD — for sending in request bodies. */
export function tomorrowISO(): string {
  return formatDateOnly(tomorrow())!;
}

/** True if the given ISO date string is today or earlier (in the configured tz). */
export function isScheduledForTodayOrPast(value: string | null | undefined): boolean {
  const d = parseDateOnly(value);
  if (!d) return false;
  return d.getTime() <= today().getTime();
}
