import { describe, expect, it } from "vitest";
import { planClearSet, type PlanCandidate } from "@/lib/plan-today";

const TODAY = "2026-10-27";
const c = (id: string, projectId: string | null, extra: Partial<PlanCandidate> = {}): PlanCandidate =>
  ({ id, projectId, done: false, scheduledFor: TODAY, ...extra });

describe("planClearSet", () => {
  it("clears today's other open tasks in the picks' project only", () => {
    const picks = [c("a1", "A")];
    const all = [c("a1", "A"), c("a2", "A"), c("b1", "B"), c("l1", null)];
    expect(planClearSet(picks, all, TODAY)).toEqual(["a2"]);
  });
  it("loose picks clear only loose tasks", () => {
    expect(planClearSet([c("l1", null)], [c("l1", null), c("l2", null), c("a1", "A")], TODAY)).toEqual(["l2"]);
  });
  it("picks spanning two projects clear both, and nothing else", () => {
    const all = [c("a1", "A"), c("a2", "A"), c("b1", "B"), c("b2", "B"), c("c1", "C"), c("l1", null)];
    expect(planClearSet([c("a1", "A"), c("b1", "B")], all, TODAY).sort()).toEqual(["a2", "b2"]);
  });
  it("never clears done tasks, tasks planned for another day, or unplanned tasks", () => {
    const all = [c("a1", "A"), c("done", "A", { done: true }), c("yday", "A", { scheduledFor: "2026-10-26" }), c("none", "A", { scheduledFor: null })];
    expect(planClearSet([c("a1", "A")], all, TODAY)).toEqual([]);
  });
  it("a pick is never in its own clear set", () => {
    expect(planClearSet([c("a1", "A"), c("a2", "A")], [c("a1", "A"), c("a2", "A")], TODAY)).toEqual([]);
  });
});
