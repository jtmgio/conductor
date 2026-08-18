import { prisma } from "./prisma";
import { type TimeBlock, timeToMinutes, minutesToTime } from "./schedule";
import { today } from "./dates";

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

  // A role counts as active if it has ANY open work — not just work that was
  // explicitly scheduled. Keying on scheduledFor meant a company with a real
  // backlog looked empty, its block got dropped, and the work stayed invisible;
  // that's how Wris went quiet for days. Iceboxed tasks don't count as work.
  const counts = await prisma.task.groupBy({
    by: ["roleId"],
    where: { done: false, status: { not: "icebox" }, roleId: { in: scheduledRoleIds } },
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

    // Short blocks stay exactly where they are, so they're islands the rebalanced blocks
    // have to flow *around*. Subtracting their minutes from the total and then laying
    // everything out contiguously from the segment start (the old approach) put a
    // rebalanced block straight on top of them — vQuip 09:18-10:09 and Wris 09:39-09:54
    // were live at the same time — and left the day 15 minutes short at the end.
    const islands = shortFixed
      .map((s) => ({
        start: timeToMinutes(s.block.startHour, s.block.startMinute),
        end: timeToMinutes(s.block.endHour, s.block.endMinute),
      }))
      .filter((i) => i.start >= seg.startMinutes && i.start < seg.endMinutes)
      .sort((a, b) => a.start - b.start);

    // The gaps between islands are what's actually available.
    const free: Array<{ start: number; end: number }> = [];
    let pos = seg.startMinutes;
    for (const island of islands) {
      if (island.start > pos) free.push({ start: pos, end: island.start });
      pos = Math.max(pos, island.end);
    }
    if (pos < seg.endMinutes) free.push({ start: pos, end: seg.endMinutes });

    const totalMinutes = free.reduce((sum, f) => sum + (f.end - f.start), 0);
    if (totalMinutes <= 0) continue;

    const blockDuration = Math.floor(totalMinutes / seg.blocks.length);

    let slot = 0;
    let cursor = free[0].start;

    for (let i = 0; i < seg.blocks.length; i++) {
      const { block, roleId } = seg.blocks[i];
      const isLast = i === seg.blocks.length - 1;

      // Move to the next free gap once this one is used up
      while (slot < free.length - 1 && cursor >= free[slot].end) {
        slot++;
        cursor = free[slot].start;
      }

      // A block never straddles an island: it takes what's left of this gap if the
      // full share doesn't fit, and the next block picks up after the island.
      const gapEnd = free[slot].end;
      const wanted = isLast ? gapEnd - cursor : blockDuration;
      const end = Math.min(cursor + wanted, gapEnd);
      if (end <= cursor) continue;

      const startTime = minutesToTime(cursor);
      const endTime = minutesToTime(end);

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

      cursor = end;
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
