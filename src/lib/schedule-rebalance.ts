import { prisma } from "./prisma";
import { type TimeBlock, timeToMinutes, minutesToTime } from "./schedule";

// Blocks shorter than this (in minutes) are "fixed" — excluded from rebalance
const MIN_REBALANCEABLE_DURATION = 30;

// Gap threshold (in minutes) to detect segment breaks (e.g., lunch)
const GAP_THRESHOLD = 15;

// Per-day cache
let cache: { date: string; blocks: TimeBlock[] } | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

export function invalidateRebalanceCache() {
  cache = null;
  cacheTime = 0;
}

interface Segment {
  startMinutes: number;
  endMinutes: number;
  blocks: Array<{ block: TimeBlock; roleId: string }>;
}

/**
 * Rebalance today's schedule blocks:
 * - Roles with zero non-done tasks have their blocks removed
 * - Remaining roles get equal time within each segment (pre-lunch, post-lunch)
 * - Fixed blocks (< 30 min) and gaps (lunch) are preserved
 */
export async function rebalanceBlocks(
  baseBlocks: TimeBlock[],
  dayOfWeek: number
): Promise<TimeBlock[]> {
  // Weekend or empty — no rebalance
  if (dayOfWeek === 0 || dayOfWeek === 6 || baseBlocks.length === 0) {
    return baseBlocks;
  }

  const now = Date.now();
  const dateKey = new Date().toISOString().slice(0, 10);
  if (cache && cache.date === dateKey && now - cacheTime < CACHE_TTL) {
    return cache.blocks;
  }

  const result = await computeRebalance(baseBlocks, dayOfWeek);
  cache = { date: dateKey, blocks: result };
  cacheTime = now;
  return result;
}

async function computeRebalance(
  baseBlocks: TimeBlock[],
  dayOfWeek: number
): Promise<TimeBlock[]> {
  // Resolve roleId for each block today
  const resolved = baseBlocks.map((block) => ({
    block,
    roleId: block.dayAssignments[String(dayOfWeek)] || null,
    durationMin: timeToMinutes(block.endHour, block.endMinute) - timeToMinutes(block.startHour, block.startMinute),
  }));

  // Get all role IDs scheduled today (any duration)
  const scheduledRoleIds = Array.from(
    new Set(resolved.filter((r) => r.roleId).map((r) => r.roleId as string))
  );
  if (scheduledRoleIds.length === 0) return baseBlocks;

  // Query which roles have non-done tasks today
  const counts = await prisma.task.groupBy({
    by: ["roleId"],
    where: { isToday: true, done: false, roleId: { in: scheduledRoleIds } },
    _count: true,
  });
  const activeRoleIds = new Set(counts.map((c) => c.roleId));

  // No-op cases: every role has tasks, or no role has tasks
  if (activeRoleIds.size === scheduledRoleIds.length) return baseBlocks;
  if (activeRoleIds.size === 0) return baseBlocks;

  // Categorize:
  //  - noRoleFixed: blocks with no role assignment for today — passed through unchanged
  //  - dropped: role exists but has no tasks — removed from output, but its span still
  //    contributes to segment boundaries so adjacent active blocks can absorb the time
  //  - shortFixed: active role + duration < 30min — preserved at original time
  //  - rebalanceable: active role + duration ≥ 30min — split equally within its segment
  const noRoleFixed: TimeBlock[] = [];
  const shortFixed: Array<{ block: TimeBlock; roleId: string }> = [];
  const rebalanceable: Array<{ block: TimeBlock; roleId: string }> = [];

  for (const r of resolved) {
    if (!r.roleId) {
      noRoleFixed.push(r.block);
      continue;
    }
    if (!activeRoleIds.has(r.roleId)) {
      // empty role — drop entirely
      continue;
    }
    if (r.durationMin < MIN_REBALANCEABLE_DURATION) {
      shortFixed.push({ block: r.block, roleId: r.roleId });
    } else {
      rebalanceable.push({ block: r.block, roleId: r.roleId });
    }
  }

  if (rebalanceable.length === 0) return baseBlocks;

  // Sort active rebalanceable blocks by start time
  const sorted = [...rebalanceable].sort(
    (a, b) =>
      timeToMinutes(a.block.startHour, a.block.startMinute) -
      timeToMinutes(b.block.startHour, b.block.startMinute)
  );

  // Build segments from EVERY role-assigned block (including dropped + short),
  // so segment spans cover the original day shape and lunch gaps are preserved.
  const allSorted = resolved
    .filter((r) => r.roleId)
    .sort(
      (a, b) =>
        timeToMinutes(a.block.startHour, a.block.startMinute) -
        timeToMinutes(b.block.startHour, b.block.startMinute)
    );

  // Detect segments from the original schedule (gaps ≥ 15 min = segment boundary)
  const segments: Segment[] = [];
  let currentSegment: Segment | null = null;

  for (const item of allSorted) {
    const start = timeToMinutes(item.block.startHour, item.block.startMinute);
    const end = timeToMinutes(item.block.endHour, item.block.endMinute);

    if (!currentSegment) {
      currentSegment = { startMinutes: start, endMinutes: end, blocks: [] };
    } else if (start - currentSegment.endMinutes >= GAP_THRESHOLD) {
      // Gap detected — finalize current segment and start new one
      segments.push(currentSegment);
      currentSegment = { startMinutes: start, endMinutes: end, blocks: [] };
    } else {
      currentSegment.endMinutes = Math.max(currentSegment.endMinutes, end);
    }
  }
  if (currentSegment) segments.push(currentSegment);

  // Assign active blocks to their segments
  for (const item of sorted) {
    const start = timeToMinutes(item.block.startHour, item.block.startMinute);
    const seg = segments.find((s) => start >= s.startMinutes && start < s.endMinutes);
    if (seg) seg.blocks.push(item);
  }

  // Rebalance within each segment
  const rebalanced: TimeBlock[] = [];

  for (const seg of segments) {
    if (seg.blocks.length === 0) continue;

    // Subtract any short-fixed time within this segment so rebalanceable blocks
    // don't get redistributed over their fixed neighbors.
    const segShortFixedMin = shortFixed.reduce((sum, s) => {
      const start = timeToMinutes(s.block.startHour, s.block.startMinute);
      const end = timeToMinutes(s.block.endHour, s.block.endMinute);
      if (start >= seg.startMinutes && start < seg.endMinutes) {
        return sum + (end - start);
      }
      return sum;
    }, 0);

    const totalMinutes = seg.endMinutes - seg.startMinutes - segShortFixedMin;
    if (totalMinutes <= 0) continue;
    const blockDuration = Math.floor(totalMinutes / seg.blocks.length);
    const remainder = totalMinutes - blockDuration * seg.blocks.length;

    let cursor = seg.startMinutes;

    for (let i = 0; i < seg.blocks.length; i++) {
      const { block, roleId } = seg.blocks[i];
      const duration = blockDuration + (i === seg.blocks.length - 1 ? remainder : 0);
      const startTime = minutesToTime(cursor);
      const endTime = minutesToTime(cursor + duration);

      rebalanced.push({
        id: block.id,
        label: block.label,
        startHour: startTime.hour,
        startMinute: startTime.minute,
        endHour: endTime.hour,
        endMinute: endTime.minute,
        sortOrder: block.sortOrder,
        dayAssignments: { [String(dayOfWeek)]: roleId },
      });

      cursor += duration;
    }
  }

  const shortFixedBlocks = shortFixed.map((s) => ({
    ...s.block,
    dayAssignments: { [String(dayOfWeek)]: s.roleId },
  }));

  // Combine rebalanced + short-fixed (with tasks) + no-role blocks, sort by start
  const all = [...rebalanced, ...shortFixedBlocks, ...noRoleFixed].sort(
    (a, b) =>
      timeToMinutes(a.startHour, a.startMinute) -
      timeToMinutes(b.startHour, b.startMinute)
  );

  return all;
}
