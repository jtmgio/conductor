/** Wall-clock parts of an instant in a timezone, as if that wall clock were UTC. */
function wallClockAsUtc(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

/**
 * The UTC instant of a wall-clock time on a calendar day in `timeZone`.
 * Meetings are stored as `date` + `HH:MM` in the server's TIMEZONE; clients need an
 * absolute instant so a laptop in another zone still alerts at the right moment.
 */
export function zonedInstant(date: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const target = Date.UTC(y, mo - 1, d, h, mi);
  // Guess, measure the zone's offset at the guess, correct; a second pass settles DST edges.
  let guess = target;
  for (let i = 0; i < 2; i++) guess += target - wallClockAsUtc(guess, timeZone);
  return new Date(guess);
}
