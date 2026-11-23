/**
 * What the /meetings/now window shows: today's meetings with the finished ones dropped.
 * Times are "HH:MM" in the app's timezone, compared against the viewer's clock — the same
 * rule AgendaStrip uses.
 */
export interface TimedMeeting {
  startTime: string;
  endTime: string;
}

export type MeetingState = "now" | "next" | "later";

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function remainingToday<T extends TimedMeeting>(
  meetings: T[],
  nowMinutes: number,
): Array<T & { state: MeetingState }> {
  const left = meetings
    .filter((m) => toMinutes(m.endTime) > nowMinutes)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  let nextTaken = false;
  return left.map((m) => {
    if (toMinutes(m.startTime) <= nowMinutes) return { ...m, state: "now" as const };
    if (!nextTaken) {
      nextTaken = true;
      return { ...m, state: "next" as const };
    }
    return { ...m, state: "later" as const };
  });
}

/** "in 5m", "in 1h 20m", "now" — how far off a start time is. */
export function untilLabel(startTime: string, nowMinutes: number): string {
  const diff = toMinutes(startTime) - nowMinutes;
  if (diff <= 0) return "now";
  if (diff < 60) return `in ${diff}m`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}
