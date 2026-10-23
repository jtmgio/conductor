import { describe, expect, it, vi } from "vitest";
import { formatDateOnly } from "@/lib/dates";

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
