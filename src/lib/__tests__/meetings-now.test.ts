import { describe, it, expect } from "vitest";
import { remainingToday, untilLabel } from "../meetings-now";

const m = (startTime: string, endTime: string, title = startTime) => ({ startTime, endTime, title });

describe("remainingToday", () => {
  it("drops finished meetings and marks now / next / later", () => {
    const out = remainingToday([m("11:00", "11:30"), m("09:00", "09:30"), m("10:00", "10:45"), m("13:00", "14:00")], 10 * 60 + 15);
    expect(out.map((x) => [x.title, x.state])).toEqual([
      ["10:00", "now"],
      ["11:00", "next"],
      ["13:00", "later"],
    ]);
  });

  it("a meeting is gone the minute it ends", () => {
    expect(remainingToday([m("09:00", "09:30")], 9 * 60 + 30)).toEqual([]);
  });

  it("overlapping meetings can both be now", () => {
    const out = remainingToday([m("09:00", "10:00"), m("09:30", "10:30")], 9 * 60 + 45);
    expect(out.map((x) => x.state)).toEqual(["now", "now"]);
  });
});

describe("untilLabel", () => {
  it("formats minutes and hours", () => {
    expect(untilLabel("10:05", 600)).toBe("in 5m");
    expect(untilLabel("11:20", 600)).toBe("in 1h 20m");
    expect(untilLabel("12:00", 600)).toBe("in 2h");
    expect(untilLabel("10:00", 600)).toBe("now");
  });
});
