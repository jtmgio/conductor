import { describe, it, expect } from "vitest";
import { zonedInstant } from "../zoned-time";

describe("zonedInstant", () => {
  it("EST winter offset", () => {
    expect(zonedInstant("2026-11-19", "10:00", "America/New_York").toISOString()).toBe("2026-11-19T15:00:00.000Z");
  });
  it("EDT summer offset", () => {
    expect(zonedInstant("2026-07-01", "10:00", "America/New_York").toISOString()).toBe("2026-07-01T14:00:00.000Z");
  });
  it("day after DST ends", () => {
    expect(zonedInstant("2026-11-02", "09:30", "America/New_York").toISOString()).toBe("2026-11-02T14:30:00.000Z");
  });
  it("late evening stays on the same local date", () => {
    expect(zonedInstant("2026-11-19", "23:30", "America/New_York").toISOString()).toBe("2026-11-20T04:30:00.000Z");
  });
  it("other zone", () => {
    expect(zonedInstant("2026-11-19", "10:00", "America/Los_Angeles").toISOString()).toBe("2026-11-19T18:00:00.000Z");
  });
});
