import { describe, expect, it, vi } from "vitest";
import { formatDateOnly, plannedDate } from "@/lib/dates";

// The walk and taskShape must agree on which day a due date falls on. Due dates
// are timestamps written at container midnight (UTC), so this is the one
// conversion both use.
describe("formatDateOnly", () => {
  it("reads a due-date timestamp as its UTC day", () => {
    expect(formatDateOnly(new Date("2026-10-22T00:00:00Z"))).toBe("2026-10-22");
    expect(formatDateOnly(new Date("2026-10-22T23:59:59Z"))).toBe("2026-10-22");
  });

  it("returns null for no date", () => {
    expect(formatDateOnly(null)).toBeNull();
    expect(formatDateOnly(undefined)).toBeNull();
  });
});

// TIMEZONE is captured when dates.ts loads, so this test re-imports it fresh
// after setting the env var instead of relying on whatever the host is set to.
describe("dayOf", () => {
  it("dayOf gives the Eastern calendar day of an instant", async () => {
    process.env.TIMEZONE = "America/New_York";
    vi.resetModules();
    const { dayOf } = await import("@/lib/dates");
    expect(dayOf(new Date("2026-10-23T02:30:00Z"))).toBe("2026-10-22");
  });
});

describe("plannedDate", () => {
  const today = new Date(Date.UTC(2026, 10, 16));

  it("leaves the plan alone when neither field is given", () => {
    expect(plannedDate(undefined, undefined, today)).toBeUndefined();
  });

  it("plans a named day", () => {
    expect(formatDateOnly(plannedDate(undefined, "2026-11-19", today))).toBe("2026-11-19");
  });

  it("clears the plan with null", () => {
    expect(plannedDate(undefined, null, today)).toBeNull();
  });

  it("keeps isToday as a shortcut for today or backlog", () => {
    expect(plannedDate(true, undefined, today)).toEqual(today);
    expect(plannedDate(false, undefined, today)).toBeNull();
  });

  it("refuses a malformed date instead of silently dropping the plan", () => {
    expect(() => plannedDate(undefined, "thursday", today)).toThrow(/YYYY-MM-DD/);
  });

  it("refuses a day already gone", () => {
    expect(() => plannedDate(undefined, "2026-11-15", today)).toThrow(/past/);
  });

  it("refuses isToday and plannedFor together", () => {
    expect(() => plannedDate(true, "2026-11-19", today)).toThrow(/not both/);
  });
});
