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

const DOW_ALIASES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Next occurrence (strictly after today) of the given weekday. */
export function nextDayOfWeek(target: number, from: Date = today()): Date {
  const cur = from.getUTCDay();
  let delta = (target - cur + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(from, delta);
}

/**
 * Scan free text for an @-tag scheduling shortcut: @today, @tomorrow, @thu,
 * @thursday, @2026-05-15, @5/15, @5-15. Returns the resolved date plus the
 * exact substring to strip from the input. Whichever tag appears first wins.
 */
export function parseScheduleTag(input: string): { iso: string; match: string } | null {
  const re = /@([A-Za-z]+|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-/]\d{1,2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const token = m[1].toLowerCase();
    if (token === "today") return { iso: todayISO(), match: m[0] };
    if (token === "tomorrow" || token === "tmrw") return { iso: tomorrowISO(), match: m[0] };
    if (token === "nextworkday" || token === "nwd") {
      return { iso: formatDateOnly(nextWorkingDay())!, match: m[0] };
    }
    if (token in DOW_ALIASES) {
      return { iso: formatDateOnly(nextDayOfWeek(DOW_ALIASES[token]))!, match: m[0] };
    }
    const iso = /^\d{4}-\d{1,2}-\d{1,2}$/.test(token)
      ? token.replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_, y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`)
      : null;
    if (iso && parseDateOnly(iso)) return { iso, match: m[0] };
    const md = /^(\d{1,2})[-/](\d{1,2})$/.exec(token);
    if (md) {
      const mo = Number(md[1]);
      const d = Number(md[2]);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        const t = today();
        let y = t.getUTCFullYear();
        const candidate = new Date(Date.UTC(y, mo - 1, d));
        if (candidate.getTime() < t.getTime()) y += 1;
        return { iso: formatDateOnly(new Date(Date.UTC(y, mo - 1, d)))!, match: m[0] };
      }
    }
  }
  return null;
}

/** True if the given ISO date string is today or earlier (in the configured tz). */
export function isScheduledForTodayOrPast(value: string | null | undefined): boolean {
  const d = parseDateOnly(value);
  if (!d) return false;
  return d.getTime() <= today().getTime();
}
