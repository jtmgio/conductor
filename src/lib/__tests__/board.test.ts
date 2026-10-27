import { describe, expect, it } from "vitest";
import { buildBoard, BOARD_CAP, viewFlags, type BoardFollowUp, type BoardOptions, type BoardTask } from "@/lib/board";

const TODAY = "2026-10-22";
const NOW = new Date("2026-10-22T15:00:00Z");
const DEFAULT: BoardOptions = { horizon: "today", owner: "me", capped: true };

let seq = 0;
function t(overrides: Partial<BoardTask> = {}): BoardTask {
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
    owner: "me",
    role: "vQuip",
    rolePriority: 1,
    updatedAt: "2026-10-22T12:00:00Z",
    ...overrides,
  };
}

let fseq = 0;
function f(overrides: Partial<BoardFollowUp> = {}): BoardFollowUp {
  fseq += 1;
  return {
    id: `fu-${fseq}`,
    title: `follow-up ${fseq}`,
    waitingOn: "Frank",
    role: "vQuip",
    createdAt: "2026-10-01T00:00:00Z",
    staleDays: 3,
    ...overrides,
  };
}

const keys = (list: { key: string }[]) => list.map((x) => x.key);

/** Every list a task can land in except changes, which deliberately overlaps the others. */
function everywhere(b: ReturnType<typeof buildBoard>): string[] {
  return [...keys(b.board), ...keys(b.stuck), ...keys(b.waitingOnReview)];
}

describe("buildBoard", () => {
  it("default view shows only my tasks due today or sooner, urgent first", () => {
    const urgent = t({ priority: "urgent" });
    const pastDue = t({ dueDate: "2026-10-20" });
    const today = t({ dueDate: TODAY });
    const thisWeek = t({ dueDate: "2026-10-25" });
    const loose = t();
    const b = buildBoard([loose, thisWeek, today, pastDue, urgent], [], TODAY, DEFAULT, NOW);
    expect(keys(b.board)).toEqual([urgent.key, pastDue.key, today.key]);
  });

  it("a task planned for today sits with urgent at the top of the board", () => {
    const later = t({ dueDate: TODAY });
    const planned = t({ scheduledFor: TODAY, createdAt: "2026-10-26T00:00:00Z" });
    const board = buildBoard([later, planned], [], TODAY, DEFAULT, NOW);
    expect(board.board[0].key).toBe(planned.key);
  });

  it("sorts inside a section by due date, then company priority, then age", () => {
    const second = t({ dueDate: "2026-10-20", rolePriority: 2, role: "HealthMe" });
    const first = t({ dueDate: "2026-10-20", rolePriority: 1 });
    const older = t({ dueDate: "2026-10-21", rolePriority: 1, createdAt: "2026-09-01T00:00:00Z" });
    const newer = t({ dueDate: "2026-10-21", rolePriority: 1, createdAt: "2026-10-10T00:00:00Z" });
    const b = buildBoard([newer, second, older, first], [], TODAY, DEFAULT, NOW);
    expect(keys(b.board)).toEqual([first.key, second.key, older.key, newer.key]);
  });

  it("caps the default view at seven with more:true and no count", () => {
    const tasks = Array.from({ length: 9 }, () => t({ dueDate: TODAY }));
    const b = buildBoard(tasks, [], TODAY, DEFAULT, NOW);
    expect(BOARD_CAP).toBe(7);
    expect(b.board).toHaveLength(7);
    expect(b.more).toBe(true);
    expect(Object.keys(b)).not.toContain("count");
    expect(Object.keys(b)).not.toContain("total");
  });

  it("says more:false when the cap cut nothing", () => {
    const b = buildBoard([t({ dueDate: TODAY })], [], TODAY, DEFAULT, NOW);
    expect(b.more).toBe(false);
  });

  // The caller decides capped (Task 3: a widened view is uncapped); buildBoard just obeys it.
  it("does not cap a widened view", () => {
    const tasks = Array.from({ length: 9 }, () => t({ dueDate: TODAY }));
    const b = buildBoard(tasks, [], TODAY, { ...DEFAULT, horizon: "week", capped: false }, NOW);
    expect(b.board).toHaveLength(9);
    expect(b.more).toBe(false);
  });

  it("week adds the next seven days; all adds everything", () => {
    const today = t({ dueDate: TODAY });
    const inWeek = t({ dueDate: "2026-10-29" });
    const later = t({ dueDate: "2026-10-30" });
    const loose = t();
    const tasks = [loose, later, inWeek, today];
    const week = buildBoard(tasks, [], TODAY, { ...DEFAULT, horizon: "week", capped: false }, NOW);
    expect(keys(week.board)).toEqual([today.key, inWeek.key]);
    const all = buildBoard(tasks, [], TODAY, { ...DEFAULT, horizon: "all", capped: false }, NOW);
    expect(keys(all.board)).toEqual([today.key, inWeek.key, later.key, loose.key]);
  });

  it("hides claude-owned tasks from the default view", () => {
    const mine = t({ dueDate: TODAY });
    const claudes = t({ dueDate: TODAY, owner: "claude" });
    const b = buildBoard([mine, claudes], [], TODAY, DEFAULT, NOW);
    expect(keys(b.board)).toEqual([mine.key]);
    expect(everywhere(b)).not.toContain(claudes.key);
  });

  it("owner:claude shows only claude tasks; owner:all shows both", () => {
    const mine = t({ dueDate: TODAY });
    const claudes = t({ dueDate: TODAY, owner: "claude" });
    const onlyClaude = buildBoard([mine, claudes], [], TODAY, { ...DEFAULT, owner: "claude", capped: false }, NOW);
    expect(keys(onlyClaude.board)).toEqual([claudes.key]);
    const both = buildBoard([mine, claudes], [], TODAY, { ...DEFAULT, owner: "all", capped: false }, NOW);
    expect(keys(both.board).sort()).toEqual([mine.key, claudes.key].sort());
  });

  it("a claude task that is past due is stuck, not on the board", () => {
    const late = t({ owner: "claude", dueDate: "2026-10-20" });
    const b = buildBoard([late], [], TODAY, { ...DEFAULT, owner: "all", capped: false }, NOW);
    expect(b.stuck).toEqual([expect.objectContaining({ key: late.key, reason: "pastDue", days: 2 })]);
    expect(b.board).toEqual([]);
  });

  it("a claude task untouched for three days is stuck", () => {
    const idle = t({ owner: "claude", updatedAt: "2026-10-19T14:00:00Z" });
    const b = buildBoard([idle], [], TODAY, { ...DEFAULT, owner: "all", horizon: "all", capped: false }, NOW);
    expect(b.stuck).toEqual([expect.objectContaining({ key: idle.key, reason: "idle", days: 3 })]);
    expect(b.board).toEqual([]);
  });

  it("a claude task updated yesterday is not stuck", () => {
    const fresh = t({ owner: "claude", updatedAt: "2026-10-21T15:00:00Z" });
    const b = buildBoard([fresh], [], TODAY, { ...DEFAULT, owner: "all", horizon: "all", capped: false }, NOW);
    expect(b.stuck).toEqual([]);
    expect(keys(b.board)).toEqual([fresh.key]);
  });

  it("stuck ignores the owner filter", () => {
    const mineBlocked = t({ status: "blocked", blockedAt: "2026-10-18T15:00:00Z" });
    const claudeLate = t({ owner: "claude", dueDate: "2026-10-20" });
    const asClaude = buildBoard([mineBlocked], [], TODAY, { ...DEFAULT, owner: "claude", capped: false }, NOW);
    expect(keys(asClaude.stuck)).toEqual([mineBlocked.key]);
    const asMe = buildBoard([claudeLate], [], TODAY, DEFAULT, NOW);
    expect(keys(asMe.stuck)).toEqual([claudeLate.key]);
  });

  it("blocked under three days is dropped; three or more, or no blockedAt, is stuck", () => {
    const recent = t({ status: "blocked", blockedAt: "2026-10-20T16:00:00Z", dueDate: TODAY });
    const old = t({ status: "blocked", blockedAt: "2026-10-19T15:00:00Z" });
    const unknown = t({ status: "blocked", blockedAt: null });
    const b = buildBoard([recent, old, unknown], [], TODAY, DEFAULT, NOW);
    expect(everywhere(b)).not.toContain(recent.key);
    const byKey = Object.fromEntries(b.stuck.map((s) => [s.key, s]));
    expect(byKey[old.key]).toMatchObject({ reason: "blocked", days: 3 });
    expect(byKey[unknown.key]).toMatchObject({ reason: "blocked", days: null });
    expect(b.stuck).toHaveLength(2);
  });

  it("in_review goes to waitingOnReview and nowhere else", () => {
    const review = t({ status: "in_review", dueDate: TODAY, owner: "claude", updatedAt: "2026-10-01T00:00:00Z" });
    const b = buildBoard([review], [], TODAY, { ...DEFAULT, owner: "all", capped: false }, NOW);
    expect(keys(b.waitingOnReview)).toEqual([review.key]);
    expect(everywhere(b)).toEqual([review.key]);
  });

  it("a task in stuck is not on the board", () => {
    const old = t({ status: "blocked", blockedAt: "2026-10-01T00:00:00Z", priority: "urgent" });
    const late = t({ owner: "claude", dueDate: "2026-10-20", priority: "urgent" });
    const idle = t({ owner: "claude", dueDate: TODAY, updatedAt: "2026-10-01T00:00:00Z" });
    const b = buildBoard([old, late, idle], [], TODAY, { ...DEFAULT, owner: "all", capped: false }, NOW);
    expect(keys(b.stuck).sort()).toEqual([old.key, late.key, idle.key].sort());
    expect(b.board).toEqual([]);
  });

  it("hides tasks whose notBefore is in the future", () => {
    const later = t({ dueDate: TODAY, notBefore: "2026-10-23" });
    const now = t({ dueDate: TODAY, notBefore: TODAY });
    const b = buildBoard([later, now], [], TODAY, DEFAULT, NOW, { at: "2026-09-01T00:00:00Z", day: "2026-09-01" });
    expect(everywhere(b)).toEqual([now.key]);
    expect(keys(b.changes!.new)).toEqual([now.key]);
  });

  it("lists follow-ups whose staleDays have passed, with daysWaiting", () => {
    const stale = f({ createdAt: "2026-10-18T15:00:00Z", staleDays: 3 });
    const fresh = f({ createdAt: "2026-10-21T15:00:00Z", staleDays: 3 });
    const b = buildBoard([], [fresh, stale], TODAY, DEFAULT, NOW);
    expect(b.waitingOn).toEqual([{ ...stale, daysWaiting: 4 }]);
  });

  it("omits changes when nothing was ever seen", () => {
    const b = buildBoard([t({ dueDate: TODAY })], [], TODAY, DEFAULT, NOW, null);
    expect(b).not.toHaveProperty("changes");
    expect(buildBoard([], [], TODAY, DEFAULT, NOW)).not.toHaveProperty("changes");
  });

  it("changes.new is everything created since last seen, any owner", () => {
    const seen = { at: "2026-10-20T13:00:00Z", day: "2026-10-20" };
    const before = t({ createdAt: "2026-10-19T00:00:00Z" });
    const mine = t({ createdAt: "2026-10-21T00:00:00Z" });
    const claudes = t({ createdAt: "2026-10-21T01:00:00Z", owner: "claude" });
    const b = buildBoard([before, mine, claudes], [], TODAY, DEFAULT, NOW, seen);
    expect(keys(b.changes!.new).sort()).toEqual([mine.key, claudes.key].sort());
  });

  it("changes.nowPastDue is what slipped since last seen", () => {
    const seen = { at: "2026-10-20T13:00:00Z", day: "2026-10-20" };
    const slipped = t({ dueDate: "2026-10-21" });
    const slippedPlan = t({ scheduledFor: "2026-10-20" });
    const longLate = t({ dueDate: "2026-10-15" });
    const dueToday = t({ dueDate: TODAY });
    // Long overdue, with a future plan date: the plan date isn't past due, so it didn't slip.
    const replanned = t({ dueDate: "2026-10-15", scheduledFor: "2026-10-24" });
    const b = buildBoard([slipped, slippedPlan, longLate, dueToday, replanned], [], TODAY, DEFAULT, NOW, seen);
    expect(keys(b.changes!.nowPastDue).sort()).toEqual([slipped.key, slippedPlan.key].sort());
  });

  it("changes.nowStuck is blocked or in_review since last seen", () => {
    const seen = { at: "2026-10-20T13:00:00Z", day: "2026-10-20" };
    const newlyBlocked = t({ status: "blocked", blockedAt: "2026-10-21T00:00:00Z" });
    const longBlocked = t({ status: "blocked", blockedAt: "2026-10-10T00:00:00Z" });
    const newReview = t({ status: "in_review", updatedAt: "2026-10-21T00:00:00Z" });
    const oldReview = t({ status: "in_review", updatedAt: "2026-10-19T00:00:00Z" });
    const b = buildBoard([newlyBlocked, longBlocked, newReview, oldReview], [], TODAY, DEFAULT, NOW, seen);
    expect(keys(b.changes!.nowStuck).sort()).toEqual([newlyBlocked.key, newReview.key].sort());
  });
});

describe("viewFlags", () => {
  it("no args: capped, and the default view", () => {
    expect(viewFlags({})).toEqual({ capped: true, isDefaultView: true });
  });

  it("explicit defaults lift the cap but still count as the default view", () => {
    expect(viewFlags({ horizon: "today" })).toEqual({ capped: false, isDefaultView: true });
    expect(viewFlags({ owner: "me" })).toEqual({ capped: false, isDefaultView: true });
  });

  it("any widened filter is neither capped nor the default view", () => {
    expect(viewFlags({ horizon: "week" })).toEqual({ capped: false, isDefaultView: false });
    expect(viewFlags({ owner: "all" })).toEqual({ capped: false, isDefaultView: false });
    expect(viewFlags({ role: "vQuip" })).toEqual({ capped: false, isDefaultView: false });
    expect(viewFlags({ project: "x" })).toEqual({ capped: false, isDefaultView: false });
  });
});
