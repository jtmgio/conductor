import { describe, expect, it } from "vitest";
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
