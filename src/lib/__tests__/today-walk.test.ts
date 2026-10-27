import { describe, expect, it } from "vitest";
import { buildWalk, WALK_SECTIONS, type WalkTask, type WalkSection } from "@/lib/today-walk";

const TODAY = "2026-10-22";
const NOW = new Date("2026-10-22T15:00:00Z");

let seq = 0;
function t(overrides: Partial<WalkTask> = {}): WalkTask {
  seq += 1;
  return {
    key: `VQ-${seq}`,
    title: `task ${seq}`,
    status: "backlog",
    priority: "normal",
    dueDate: null,
    scheduledFor: null,
    notBefore: null,
    blockedAt: null,
    createdAt: "2026-10-01T00:00:00Z",
    project: null,
    ...overrides,
  };
}

function sectionOf(walk: ReturnType<typeof buildWalk>, key: string): WalkSection | null {
  for (const s of WALK_SECTIONS) if (walk.sections[s].some((e) => e.task.key === key)) return s;
  return null;
}

function everywhere(walk: ReturnType<typeof buildWalk>): string[] {
  return [
    ...WALK_SECTIONS.flatMap((s) => walk.sections[s].map((e) => e.task.key)),
    ...walk.blockedCheckIn.map((e) => e.task.key),
    ...walk.waitingOnReview.map((e) => e.task.key),
  ];
}

describe("buildWalk", () => {
  it("lists sections in walk order", () => {
    expect(WALK_SECTIONS).toEqual(["urgent", "pastDue", "today", "thisWeek", "inProgress", "rest"]);
  });

  it("puts urgent first, and an urgent past-due task stays in urgent with pastDue true", () => {
    const u = t({ priority: "urgent", dueDate: "2026-10-16" });
    const walk = buildWalk([u], TODAY, NOW);
    expect(sectionOf(walk, u.key)).toBe("urgent");
    expect(walk.sections.urgent[0].pastDue).toBe(true);
    expect(everywhere(walk)).toEqual([u.key]);
  });

  it("puts a task past its due date in pastDue", () => {
    const p = t({ dueDate: "2026-10-21" });
    const walk = buildWalk([p], TODAY, NOW);
    expect(sectionOf(walk, p.key)).toBe("pastDue");
    expect(walk.sections.pastDue[0].pastDue).toBe(true);
  });

  it("treats a task left on an earlier day's plan as past due", () => {
    const s = t({ scheduledFor: "2026-10-20" });
    const walk = buildWalk([s], TODAY, NOW);
    expect(sectionOf(walk, s.key)).toBe("pastDue");
    expect(walk.sections.pastDue[0].pastDue).toBe(true);
  });

  it("puts tasks due today in today", () => {
    const due = t({ dueDate: TODAY });
    const walk = buildWalk([due], TODAY, NOW);
    expect(sectionOf(walk, due.key)).toBe("today");
    expect(walk.sections.today[0].pastDue).toBe(false);
  });

  it("planned for today ranks with urgent, and keeps its past-due flag", () => {
    const planned = t({ scheduledFor: TODAY });
    const plannedButLate = t({ scheduledFor: TODAY, dueDate: "2026-10-20" });
    const walk = buildWalk([planned, plannedButLate], TODAY, NOW);
    expect(sectionOf(walk, planned.key)).toBe("urgent");
    expect(sectionOf(walk, plannedButLate.key)).toBe("urgent");
    expect(walk.sections.urgent.find((e) => e.task.key === plannedButLate.key)?.pastDue).toBe(true);
    expect(walk.sections.today).toHaveLength(0);
  });

  it("thisWeek covers the next seven days and no further", () => {
    const in7 = t({ dueDate: "2026-10-29" });
    const in8 = t({ dueDate: "2026-10-30" });
    const walk = buildWalk([in7, in8], TODAY, NOW);
    expect(sectionOf(walk, in7.key)).toBe("thisWeek");
    expect(sectionOf(walk, in8.key)).toBe("rest");
  });

  it("puts in-progress work with no dates in inProgress", () => {
    const ip = t({ status: "in_progress" });
    expect(sectionOf(buildWalk([ip], TODAY, NOW), ip.key)).toBe("inProgress");
  });

  it("groups rest by project A to Z, case-insensitive, with loose tasks last", () => {
    const loose = t();
    const ops = t({ project: "ops chat" });
    const aws = t({ project: "AWS cost" });
    const walk = buildWalk([loose, ops, aws], TODAY, NOW);
    expect(walk.sections.rest.map((e) => e.task.key)).toEqual([aws.key, ops.key, loose.key]);
  });

  it("sorts inside a section by due date, no date last, then oldest first", () => {
    const later = t({ dueDate: "2026-11-20", createdAt: "2026-10-01T00:00:00Z" });
    const sooner = t({ dueDate: "2026-11-10", createdAt: "2026-10-05T00:00:00Z" });
    const undatedNew = t({ createdAt: "2026-10-10T00:00:00Z" });
    const undatedOld = t({ createdAt: "2026-10-02T00:00:00Z" });
    const walk = buildWalk([undatedNew, later, undatedOld, sooner], TODAY, NOW);
    expect(walk.sections.rest.map((e) => e.task.key)).toEqual([sooner.key, later.key, undatedOld.key, undatedNew.key]);
  });

  it("places every visible task exactly once", () => {
    const tasks = [
      t({ priority: "urgent", dueDate: TODAY, status: "in_progress" }),
      t({ dueDate: "2026-10-01", status: "in_progress" }),
      t({ scheduledFor: TODAY, dueDate: "2026-10-25" }),
      t({ status: "in_progress", dueDate: "2026-10-24" }),
      t({ project: "AWS cost" }),
      t({ status: "in_review" }),
      t({ status: "blocked", blockedAt: null }),
    ];
    const keys = everywhere(buildWalk(tasks, TODAY, NOW));
    expect(keys.sort()).toEqual(tasks.map((x) => x.key).sort());
  });

  it("hides a task whose notBefore is in the future", () => {
    const later = t({ notBefore: "2026-10-23", priority: "urgent" });
    expect(everywhere(buildWalk([later], TODAY, NOW))).toEqual([]);
  });

  it("flags newlyAvailable for three days after notBefore", () => {
    const fresh = t({ notBefore: "2026-10-20" });
    const old = t({ notBefore: "2026-10-19" });
    const walk = buildWalk([fresh, old], TODAY, NOW);
    const byKey = Object.fromEntries(walk.sections.rest.map((e) => [e.task.key, e.newlyAvailable]));
    expect(byKey[fresh.key]).toBe(true);
    expect(byKey[old.key]).toBe(false);
  });

  it("leaves out a task blocked for under three days", () => {
    const b = t({ status: "blocked", blockedAt: "2026-10-20T16:00:00Z" });
    expect(everywhere(buildWalk([b], TODAY, NOW))).toEqual([]);
  });

  it("brings back a task blocked for three days or more in blockedCheckIn", () => {
    const b = t({ status: "blocked", blockedAt: "2026-10-19T15:00:00Z", priority: "urgent" });
    const walk = buildWalk([b], TODAY, NOW);
    expect(walk.blockedCheckIn.map((e) => e.task.key)).toEqual([b.key]);
    expect(walk.blockedCheckIn[0].blockedDays).toBe(3);
    expect(sectionOf(walk, b.key)).toBeNull();
  });

  it("puts a blocked task with no blockedAt in blockedCheckIn", () => {
    const b = t({ status: "blocked", blockedAt: null });
    const walk = buildWalk([b], TODAY, NOW);
    expect(walk.blockedCheckIn.map((e) => e.task.key)).toEqual([b.key]);
    expect(walk.blockedCheckIn[0].blockedDays).toBeNull();
  });

  it("puts in_review tasks in waitingOnReview, not the main walk", () => {
    const r = t({ status: "in_review", priority: "urgent" });
    const walk = buildWalk([r], TODAY, NOW);
    expect(walk.waitingOnReview.map((e) => e.task.key)).toEqual([r.key]);
    expect(sectionOf(walk, r.key)).toBeNull();
  });
});
