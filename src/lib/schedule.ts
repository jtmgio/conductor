import { prisma } from "./prisma";

const TIMEZONE = process.env.TIMEZONE || "America/New_York";

/** Get current time in the configured timezone */
export function localNow(): Date {
  const now = new Date();
  const localStr = now.toLocaleString("en-US", { timeZone: TIMEZONE });
  return new Date(localStr);
}

export interface TimeBlock {
  id: string;
  label: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  sortOrder: number;
  dayAssignments: Record<string, string>; // { "1": roleId, "2": roleId, ... }
}

// Cache to avoid DB hit on every request
let cachedBlocks: TimeBlock[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 60 seconds

async function getRawBlocks(): Promise<TimeBlock[]> {
  const now = Date.now();
  if (cachedBlocks && now - cacheTimestamp < CACHE_TTL) {
    return cachedBlocks;
  }

  const blocks = await prisma.scheduleBlock.findMany({
    orderBy: [{ startHour: "asc" }, { startMinute: "asc" }],
  });

  cachedBlocks = blocks.map((b) => ({
    id: b.id,
    label: b.label,
    startHour: b.startHour,
    startMinute: b.startMinute,
    endHour: b.endHour,
    endMinute: b.endMinute,
    sortOrder: b.sortOrder,
    dayAssignments: (b.dayAssignments as Record<string, string>) || {},
  }));
  cacheTimestamp = now;
  return cachedBlocks;
}

function clampToDay(total: number): number {
  if (total < 0) return 0;
  if (total > 24 * 60 - 1) return 24 * 60 - 1;
  return total;
}

function applyShift(blocks: TimeBlock[], shiftMinutes: number): TimeBlock[] {
  if (!shiftMinutes) return blocks;
  return blocks.map((b) => {
    const start = clampToDay(timeToMinutes(b.startHour, b.startMinute) + shiftMinutes);
    const end = clampToDay(timeToMinutes(b.endHour, b.endMinute) + shiftMinutes);
    const s = minutesToTime(start);
    const e = minutesToTime(end);
    return { ...b, startHour: s.hour, startMinute: s.minute, endHour: e.hour, endMinute: e.minute };
  });
}

export async function getScheduleBlocks(referenceDate?: Date): Promise<TimeBlock[]> {
  const raw = await getRawBlocks();
  const d = referenceDate || localNow();
  const profile = await prisma.userProfile.findUnique({
    where: { id: "default" },
    select: { dayShiftDate: true, dayShiftMinutes: true },
  });
  if (!profile?.dayShiftDate || !profile.dayShiftMinutes) return raw;
  const shiftIso = profile.dayShiftDate.toISOString().slice(0, 10);
  const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (shiftIso !== todayIso) return raw;
  return applyShift(raw, profile.dayShiftMinutes);
}

export function invalidateScheduleCache() {
  cachedBlocks = null;
  cacheTimestamp = 0;
}

export function timeToMinutes(h: number, m: number): number {
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): { hour: number; minute: number } {
  return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 };
}

export async function getCurrentBlock(now?: Date): Promise<{
  block: TimeBlock;
  roleId: string;
} | null> {
  const d = now || localNow();
  const blocks = await getScheduleBlocks(d);
  if (blocks.length === 0) return null;

  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, etc.
  const currentMinutes = timeToMinutes(d.getHours(), d.getMinutes());

  // Weekend — off the clock
  if (dayOfWeek === 0 || dayOfWeek === 6) return null;

  for (const block of blocks) {
    const start = timeToMinutes(block.startHour, block.startMinute);
    const end = timeToMinutes(block.endHour, block.endMinute);

    if (currentMinutes >= start && currentMinutes < end) {
      const roleId = block.dayAssignments[String(dayOfWeek)];
      if (roleId) {
        return { block, roleId };
      }
      // Block exists but no role assigned for this day — try next block
    }
  }

  return null;
}

export async function getNextBlocks(count: number = 3, now?: Date): Promise<
  Array<{
    block: TimeBlock;
    roleId: string;
  }>
> {
  const d = now || localNow();
  const blocks = await getScheduleBlocks(d);
  if (blocks.length === 0) return [];

  const dayOfWeek = d.getDay();
  const currentMinutes = timeToMinutes(d.getHours(), d.getMinutes());

  if (dayOfWeek === 0 || dayOfWeek === 6) return [];

  const upcoming: Array<{ block: TimeBlock; roleId: string }> = [];

  for (const block of blocks) {
    const start = timeToMinutes(block.startHour, block.startMinute);
    if (start > currentMinutes) {
      const roleId = block.dayAssignments[String(dayOfWeek)];
      if (roleId) {
        upcoming.push({ block, roleId });
        if (upcoming.length >= count) break;
      }
    }
  }

  return upcoming;
}

export function getTimeLabel(block: TimeBlock): string {
  const fmt = (h: number, m: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
  };
  return `${fmt(block.startHour, block.startMinute)} – ${fmt(block.endHour, block.endMinute)}`;
}

export function getOffClockMessage(now?: Date): string | null {
  const d = now || localNow();
  const day = d.getDay();
  const hour = d.getHours();

  if (day === 0 || day === 6) return "Weekend";
  // 17:00–19:59. This was `hour < 19` with the next rule at `hour >= 20`,
  // which left 19:00–19:59 returning null — i.e. on the clock — so the comms
  // sweep fired three more times between 7 and 8 PM, right after family time.
  if (hour >= 17 && hour < 20) return "Family time";
  if (hour >= 20) return "Done for the day";
  if (hour < 7) return "Before hours";

  return null;
}

// Legacy compat — getAllBlocks returns cached blocks synchronously if available, otherwise empty
export function getAllBlocks(): TimeBlock[] {
  return cachedBlocks || [];
}
