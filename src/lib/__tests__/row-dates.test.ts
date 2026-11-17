import { describe, expect, it } from "vitest";
import { rowDates } from "@/lib/row-dates";

const TODAY = "2026-11-17";

describe("rowDates", () => {
  it("shows nothing for an undated task", () => {
    expect(rowDates(null, null, TODAY)).toEqual({ planned: null, due: null });
  });

  it("shows the planned day on a task with no deadline", () => {
    expect(rowDates("2026-11-17", null, TODAY)).toEqual({ planned: "Today", due: null });
    expect(rowDates("2026-11-19", null, TODAY)).toEqual({ planned: "Nov 19", due: null });
  });

  it("shows both when planned and due differ", () => {
    expect(rowDates("2026-11-17", "2026-11-20", TODAY)).toEqual({ planned: "Today", due: "due Nov 20" });
  });

  it("says due today once, not twice, when they match", () => {
    expect(rowDates("2026-11-17", "2026-11-17", TODAY)).toEqual({ planned: null, due: "due today" });
  });

  it("labels a deadline as due", () => {
    expect(rowDates(null, "2026-11-17", TODAY)).toEqual({ planned: null, due: "due today" });
    expect(rowDates(null, "2026-11-20T00:00:00.000Z", TODAY)).toEqual({ planned: null, due: "due Nov 20" });
  });
});
