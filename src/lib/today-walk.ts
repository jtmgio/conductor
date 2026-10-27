// The morning walk: one company's open tasks in the order Claude walks them.
// Pure on purpose — dates come in as YYYY-MM-DD strings so the ordering can be
// tested without a database and can't drift on timezones.

export interface WalkTask {
  key: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;      // YYYY-MM-DD
  scheduledFor: string | null; // YYYY-MM-DD
  notBefore: string | null;    // YYYY-MM-DD
  blockedAt: string | null;    // ISO timestamp
  createdAt: string;           // ISO timestamp
  project: string | null;      // project name
}

export type WalkSection = "urgent" | "pastDue" | "today" | "thisWeek" | "inProgress" | "rest";

export const WALK_SECTIONS: WalkSection[] = ["urgent", "pastDue", "today", "thisWeek", "inProgress", "rest"];

export interface WalkEntry<T extends WalkTask> {
  task: T;
  pastDue: boolean;
  newlyAvailable: boolean;
}

export interface Walk<T extends WalkTask> {
  sections: Record<WalkSection, WalkEntry<T>[]>;
  blockedCheckIn: (WalkEntry<T> & { blockedDays: number | null })[];
  waitingOnReview: WalkEntry<T>[];
}

/** Same threshold as BLOCKED_STALE_DAYS in TodayCockpit: blocked this long, ask again. */
export const BLOCKED_CHECK_IN_DAYS = 3;
/** A task whose notBefore landed this many days ago (or fewer) is flagged as new. */
const NEWLY_AVAILABLE_DAYS = 3;
const DAY_MS = 86_400_000;

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split("T")[0];
}

function byDueThenAge(a: WalkTask, b: WalkTask): number {
  return (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") || a.createdAt.localeCompare(b.createdAt);
}

// Planned-today ranks with urgent: Josh chose it this morning, so it outranks past due.
export function sectionFor(t: WalkTask, today: string, weekEnd: string): WalkSection {
  if (t.priority === "urgent" || t.scheduledFor === today) return "urgent";
  if ((t.dueDate && t.dueDate < today) || (t.scheduledFor && t.scheduledFor < today)) return "pastDue";
  if (t.dueDate === today) return "today";
  if (t.dueDate && t.dueDate <= weekEnd) return "thisWeek";
  if (t.status === "in_progress") return "inProgress";
  return "rest";
}

/** Walk the given open tasks (caller filters done and icebox). Each task lands in exactly one place. */
export function buildWalk<T extends WalkTask>(tasks: T[], today: string, now: Date = new Date()): Walk<T> {
  const weekEnd = addDaysYmd(today, 7);
  const freshFrom = addDaysYmd(today, -(NEWLY_AVAILABLE_DAYS - 1));
  const walk: Walk<T> = {
    sections: { urgent: [], pastDue: [], today: [], thisWeek: [], inProgress: [], rest: [] },
    blockedCheckIn: [],
    waitingOnReview: [],
  };

  for (const task of tasks) {
    if (task.notBefore && task.notBefore > today) continue;
    const entry: WalkEntry<T> = {
      task,
      pastDue: (!!task.dueDate && task.dueDate < today) || (!!task.scheduledFor && task.scheduledFor < today),
      newlyAvailable: !!task.notBefore && task.notBefore >= freshFrom,
    };

    if (task.status === "blocked") {
      const blockedDays = task.blockedAt ? Math.floor((now.getTime() - Date.parse(task.blockedAt)) / DAY_MS) : null;
      if (blockedDays === null || blockedDays >= BLOCKED_CHECK_IN_DAYS) walk.blockedCheckIn.push({ ...entry, blockedDays });
      continue;
    }
    if (task.status === "in_review") {
      walk.waitingOnReview.push(entry);
      continue;
    }
    walk.sections[sectionFor(task, today, weekEnd)].push(entry);
  }

  for (const s of WALK_SECTIONS) walk.sections[s].sort((a, b) => byDueThenAge(a.task, b.task));
  // Rest reads project by project, loose tasks last.
  walk.sections.rest.sort((a, b) => {
    const pa = a.task.project, pb = b.task.project;
    if (pa !== pb) {
      if (!pa) return 1;
      if (!pb) return -1;
      const byName = pa.localeCompare(pb, undefined, { sensitivity: "base" });
      if (byName) return byName;
    }
    return byDueThenAge(a.task, b.task);
  });
  walk.blockedCheckIn.sort((a, b) => byDueThenAge(a.task, b.task));
  walk.waitingOnReview.sort((a, b) => byDueThenAge(a.task, b.task));
  return walk;
}
