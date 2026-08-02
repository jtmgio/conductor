import { prisma } from "./prisma";
import {
  getScheduleBlocks,
  localNow,
  timeToMinutes,
  getOffClockMessage,
  type TimeBlock,
} from "./schedule";

const TIMEZONE = process.env.TIMEZONE || "America/New_York";

// ---------------------------------------------------------------------------
// Pure logic (unit-testable — no IO)
// ---------------------------------------------------------------------------

export interface SweepBoundary {
  minutes: number; // end-of-block, minutes-of-day
  blockId: string;
}

/**
 * Distinct end-of-block boundaries for the given weekday, ascending. Only blocks
 * with a role assigned that day count — those are the real work blocks, and each
 * block change is a natural moment to sweep comms.
 */
export function sweepBoundaries(blocks: TimeBlock[], dayOfWeek: number): SweepBoundary[] {
  const seen = new Map<number, string>();
  for (const b of blocks) {
    const roleId = b.dayAssignments[String(dayOfWeek)];
    if (!roleId) continue;
    const end = timeToMinutes(b.endHour, b.endMinute);
    if (!seen.has(end)) seen.set(end, b.id);
  }
  return Array.from(seen.entries())
    .map(([minutes, blockId]) => ({ minutes, blockId }))
    .sort((a, b) => a.minutes - b.minutes);
}

export interface SweepState {
  dueNow: boolean;
  dueBlockId: string | null; // a boundary passed that hasn't been swept
  nextSweepMinutes: number | null; // next upcoming boundary
  nextSweepBlockId: string | null;
}

/**
 * `dueNow` when a block boundary has passed (<= now) since the last sweep.
 * `nextSweep*` always points at the next upcoming boundary (the covered-state label).
 */
export function computeSweepState(
  boundaries: SweepBoundary[],
  nowMinutes: number,
  lastSweepMinutesToday: number | null
): SweepState {
  const lastRef = lastSweepMinutesToday ?? -1;

  let dueBlockId: string | null = null;
  for (const b of boundaries) {
    if (b.minutes <= nowMinutes && b.minutes > lastRef) {
      dueBlockId = b.blockId; // keep the most recent passed-and-unswept boundary
    }
  }

  const next = boundaries.find((b) => b.minutes > nowMinutes) ?? null;

  return {
    dueNow: dueBlockId !== null,
    dueBlockId,
    nextSweepMinutes: next ? next.minutes : null,
    nextSweepBlockId: next ? next.blockId : null,
  };
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
  dueBlockId: string | null;
  nextSweepLabel: string | null;
  nextSweepInMin: number | null;
  nextSweepBlockId: string | null;
}

export async function getCommsCoverPayload(): Promise<CommsCoverPayload> {
  const d = localNow();
  const dayOfWeek = d.getDay();
  const offClock = getOffClockMessage(d) !== null || dayOfWeek === 0 || dayOfWeek === 6;

  const blocks = await getScheduleBlocks(d);
  const boundaries = sweepBoundaries(blocks, dayOfWeek);
  const nowMinutes = timeToMinutes(d.getHours(), d.getMinutes());

  const profile = await prisma.userProfile.findUnique({
    where: { id: "default" },
    select: { lastSweepAt: true },
  });
  const lastMin = lastSweepLocalMinutes(profile?.lastSweepAt ?? null, d);

  const state = computeSweepState(boundaries, nowMinutes, lastMin);

  return {
    offClock,
    dueNow: !offClock && state.dueNow,
    dueBlockId: state.dueBlockId,
    nextSweepLabel: state.nextSweepMinutes != null ? labelForMinutes(state.nextSweepMinutes) : null,
    nextSweepInMin: state.nextSweepMinutes != null ? Math.max(0, state.nextSweepMinutes - nowMinutes) : null,
    nextSweepBlockId: state.nextSweepBlockId,
  };
}
