import { describe, expect, it } from "vitest";
import { checkDayCap, DAY_CAP } from "@/lib/day-cap";

describe("checkDayCap", () => {
  it("caps a company's day at five", () => {
    expect(DAY_CAP).toBe(5);
  });

  it("allows planning up to the cap", () => {
    expect(checkDayCap(["a", "b", "c", "d"], ["e"]).ok).toBe(true);
  });

  it("refuses the task that would go past it", () => {
    const r = checkDayCap(["a", "b", "c", "d", "e"], ["f"]);
    expect(r).toEqual({ ok: false, planned: 5, adding: 1 });
  });

  it("doesn't count a task already on that day twice", () => {
    expect(checkDayCap(["a", "b", "c", "d", "e"], ["c"]).ok).toBe(true);
  });

  it("counts a batch together", () => {
    expect(checkDayCap(["a", "b", "c"], ["d", "e", "f"]).ok).toBe(false);
  });
});
