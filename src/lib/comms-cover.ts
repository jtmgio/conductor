import { prisma } from "./prisma";
import { localNow, timeToMinutes, getOffClockMessage } from "./schedule";

const TIMEZONE = process.env.TIMEZONE || "America/New_York";

// ---------------------------------------------------------------------------
// Pure logic (unit-testable — no IO)
// ---------------------------------------------------------------------------

/**
 * Minutes between sweeps.
 *
 * This used to key off schedule-block boundaries — sweep when you change companies. Neat
 * in theory, but the real schedule has 60-minute blocks in the morning and three
 * boundaries inside 30 minutes at midday, so the gap swung between an hour and a quarter
 * of one. A flat interval is what "check messages regularly" actually means.
 */
export const SWEEP_INTERVAL_MIN = 20;

export interface SweepState {
  dueNow: boolean;
  /** Minutes until the next sweep — 0 when one is due now. */
  minutesUntilNext: number;
}

/**
 * Due when it's been SWEEP_INTERVAL_MIN since the last sweep. No sweep yet today means
 * due immediately: the first check of the day is the one most worth doing.
 */
export function computeSweepState(
  nowMinutes: number,
  lastSweepMinutesToday: number | null,
  intervalMin: number = SWEEP_INTERVAL_MIN
): SweepState {
  if (lastSweepMinutesToday == null) return { dueNow: true, minutesUntilNext: 0 };
  const elapsed = nowMinutes - lastSweepMinutesToday;
  if (elapsed >= intervalMin) return { dueNow: true, minutesUntilNext: 0 };
  return { dueNow: false, minutesUntilNext: intervalMin - elapsed };
}

/** "10:30" style label from minutes-of-day. */
export function labelForMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

/** Local minutes-of-day of a UTC instant, but only if it falls on `nowLocal`'s date. */
export function lastSweepLocalMinutes(lastSweepAt: Date | null, nowLocal: Date): number | null {
  if (!lastSweepAt) return null;
  const local = new Date(lastSweepAt.toLocaleString("en-US", { timeZone: TIMEZONE }));
  if (
    local.getFullYear() === nowLocal.getFullYear() &&
    local.getMonth() === nowLocal.getMonth() &&
    local.getDate() === nowLocal.getDate()
  ) {
    return local.getHours() * 60 + local.getMinutes();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Payload builder (shared by GET /api/comms-cover and POST .../sweep)
// ---------------------------------------------------------------------------

export interface CommsCoverPayload {
  offClock: boolean;
  dueNow: boolean;
  /** When the next sweep lands, e.g. "10:40 AM". */
  nextSweepLabel: string | null;
  nextSweepInMin: number | null;
  intervalMin: number;
}

export async function getCommsCoverPayload(): Promise<CommsCoverPayload> {
  const d = localNow();
  const dayOfWeek = d.getDay();
  const offClock = getOffClockMessage(d) !== null || dayOfWeek === 0 || dayOfWeek === 6;

  const nowMinutes = timeToMinutes(d.getHours(), d.getMinutes());

  const profile = await prisma.userProfile.findUnique({
    where: { id: "default" },
    select: { lastSweepAt: true },
  });
  const lastMin = lastSweepLocalMinutes(profile?.lastSweepAt ?? null, d);

  const state = computeSweepState(nowMinutes, lastMin);

  return {
    offClock,
    dueNow: !offClock && state.dueNow,
    nextSweepInMin: state.minutesUntilNext,
    nextSweepLabel: labelForMinutes(nowMinutes + state.minutesUntilNext),
    intervalMin: SWEEP_INTERVAL_MIN,
  };
}
