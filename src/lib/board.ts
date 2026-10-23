// The dispatch board: every company's open tasks on one list, plus what's stuck,
// waiting on review, waiting on someone, and what changed since the last look.
// Pure like buildWalk, and shares its sectionFor so "past due" and "today" mean
// the same thing here as in the walk.

import { addDaysYmd, BLOCKED_CHECK_IN_DAYS, sectionFor, WALK_SECTIONS, type WalkSection, type WalkTask } from "@/lib/today-walk";

export interface BoardTask extends WalkTask {
  owner: "me" | "claude";
  role: string;
  rolePriority: number;
  updatedAt: string; // ISO timestamp
}

export interface BoardFollowUp {
  id: string;
  title: string;
  waitingOn: string;
  role: string;
  createdAt: string; // ISO timestamp
  staleDays: number;
}

export type Horizon = "today" | "week" | "all";
export type OwnerFilter = "me" | "claude" | "all";

/** `capped` is the caller's call: only the default view is cut, a widened one was asked for. */
export interface BoardOptions {
  horizon: Horizon;
  owner: OwnerFilter;
  capped: boolean;
}

export type StuckReason = "blocked" | "pastDue" | "idle";

export interface Board<T extends BoardTask> {
  board: T[];
  more: boolean;
  stuck: (T & { reason: StuckReason; days: number | null })[];
  waitingOnReview: T[];
  waitingOn: (BoardFollowUp & { daysWaiting: number })[];
  changes?: { new: T[]; nowPastDue: T[]; nowStuck: T[] };
}

/** Seven lines is what fits in a glance. More than that and the list stops being a decision. */
export const BOARD_CAP = 7;
/** A hand-off with no due date comes back once Claude hasn't touched it in this long. */
export const CLAUDE_IDLE_DAYS = 3;
const DAY_MS = 86_400_000;

const HORIZON_SECTIONS: Record<Horizon, WalkSection[]> = {
  today: ["urgent", "pastDue", "today"],
  week: ["urgent", "pastDue", "today", "thisWeek"],
  all: WALK_SECTIONS,
};

function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS);
}

/** Due date soonest first (none last), then the higher-priority company, then oldest. */
function byDueRoleAge(a: BoardTask, b: BoardTask): number {
  return (
    (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") ||
    a.rolePriority - b.rolePriority ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

function isPastDue(t: WalkTask, today: string): boolean {
  return (!!t.dueDate && t.dueDate < today) || (!!t.scheduledFor && t.scheduledFor < today);
}

/** Days since the earliest date the task has already missed. */
function daysPastDue(t: WalkTask, today: string): number {
  const missed = [t.dueDate, t.scheduledFor].filter((d): d is string => !!d && d < today).sort()[0];
  return Math.round((Date.parse(today) - Date.parse(missed)) / DAY_MS);
}

/** Build the board from open tasks (caller filters done and icebox). Each task lands in at most one of board/stuck/waitingOnReview. */
export function buildBoard<T extends BoardTask>(
  tasks: T[],
  followUps: BoardFollowUp[],
  today: string,
  opts: BoardOptions,
  now: Date = new Date(),
  lastSeen?: { at: string; day: string } | null,
): Board<T> {
  const weekEnd = addDaysYmd(today, 7);
  const keep = new Set(HORIZON_SECTIONS[opts.horizon]);
  const visible = tasks.filter((t) => !(t.notBefore && t.notBefore > today));

  const stuck: Board<T>["stuck"] = [];
  const waitingOnReview: T[] = [];
  const candidates: { task: T; section: WalkSection }[] = [];

  for (const task of visible) {
    // Stuck ignores the owner filter: these are the tasks the board exists to bring back.
    if (task.status === "blocked") {
      const days = task.blockedAt ? daysSince(task.blockedAt, now) : null;
      if (days === null || days >= BLOCKED_CHECK_IN_DAYS) stuck.push({ ...task, reason: "blocked", days });
      continue;
    }
    if (task.status === "in_review") {
      waitingOnReview.push(task);
      continue;
    }
    if (task.owner === "claude") {
      if (isPastDue(task, today)) {
        stuck.push({ ...task, reason: "pastDue", days: daysPastDue(task, today) });
        continue;
      }
      const idle = daysSince(task.updatedAt, now);
      if (idle >= CLAUDE_IDLE_DAYS) {
        stuck.push({ ...task, reason: "idle", days: idle });
        continue;
      }
    }
    if (opts.owner !== "all" && task.owner !== opts.owner) continue;
    const section = sectionFor(task, today, weekEnd);
    if (keep.has(section)) candidates.push({ task, section });
  }

  candidates.sort(
    (a, b) => WALK_SECTIONS.indexOf(a.section) - WALK_SECTIONS.indexOf(b.section) || byDueRoleAge(a.task, b.task),
  );
  const ordered = candidates.map((c) => c.task);
  const board = opts.capped ? ordered.slice(0, BOARD_CAP) : ordered;

  stuck.sort(byDueRoleAge);
  waitingOnReview.sort(byDueRoleAge);

  const waitingOn = followUps
    .filter((fu) => Date.parse(fu.createdAt) + fu.staleDays * DAY_MS <= now.getTime())
    .map((fu) => ({ ...fu, daysWaiting: daysSince(fu.createdAt, now) }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting);

  const result: Board<T> = { board, more: board.length < ordered.length, stuck, waitingOnReview, waitingOn };

  // No lastSeen means no baseline: say nothing rather than call everything new.
  if (lastSeen) {
    const at = Date.parse(lastSeen.at);
    const after = (iso: string | null) => !!iso && Date.parse(iso) > at;
    // Slipped = a date that is past now but wasn't yet past when last seen.
    const slipped = (d: string | null) => !!d && d < today && d >= lastSeen.day;
    result.changes = {
      new: visible.filter((t) => after(t.createdAt)),
      nowPastDue: visible.filter((t) => slipped(t.dueDate) || slipped(t.scheduledFor)),
      nowStuck: visible.filter((t) => after(t.blockedAt) || (t.status === "in_review" && after(t.updatedAt))),
    };
  }
  return result;
}
