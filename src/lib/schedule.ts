import { prisma } from "./prisma";

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

export async function getScheduleBlocks(): Promise<TimeBlock[]> {
  const now = Date.now();
  if (cachedBlocks && now - cacheTimestamp < CACHE_TTL) {
    return cachedBlocks;
  }

  const blocks = await prisma.scheduleBlock.findMany({
    orderBy: { sortOrder: "asc" },
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

export function invalidateScheduleCache() {
  cachedBlocks = null;
  cacheTimestamp = 0;
}

function timeToMinutes(h: number, m: number): number {
  return h * 60 + m;
}

export async function getCurrentBlock(now?: Date): Promise<{
  block: TimeBlock;
  roleId: string;
} | null> {
  const blocks = await getScheduleBlocks();
  if (blocks.length === 0) return null;

  const d = now || new Date();
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
  const blocks = await getScheduleBlocks();
  if (blocks.length === 0) return [];

  const d = now || new Date();
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
  const d = now || new Date();
  const day = d.getDay();
  const hour = d.getHours();

  if (day === 0 || day === 6) return "Weekend";
  if (hour >= 17 && hour < 19) return "Family time";
  if (hour >= 20) return "Done for the day";
  if (hour < 7) return "Before hours";

  return null;
}

// Legacy compat — getAllBlocks returns cached blocks synchronously if available, otherwise empty
export function getAllBlocks(): TimeBlock[] {
  return cachedBlocks || [];
}
