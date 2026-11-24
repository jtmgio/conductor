import { describe, it, expect } from "vitest";
import { remindersForToday, weekdayOf, type ReminderRow } from "../reminders-today";

const TZ = "America/New_York";
const todayStart = new Date("2026-11-24T00:00:00.000Z");
const row = (o: Partial<ReminderRow>): ReminderRow => ({
  id: "r", label: "Take vitamins", hour: 9, minute: 45, days: [2], active: true,
  lastAckOn: null, icon: "pill", durationMin: null, tier: "critical", ...o,
});

describe("remindersForToday", () => {
  it("filtersByWeekdayAndActive", () => {
    const out = remindersForToday(
      [row({ id: "a", days: [1] }), row({ id: "b", days: [2] }), row({ id: "c", days: [1], active: false })],
      "2026-11-23", 1, TZ, todayStart,
    );
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("computesDueAtInZone", () => {
    const [r] = remindersForToday([row({})], "2026-11-24", 2, TZ, todayStart);
    expect(r.dueAt).toBe("2026-11-24T14:45:00.000Z");
  });

  it("marksAckedToday", () => {
    const out = remindersForToday(
      [row({ id: "today", lastAckOn: todayStart }), row({ id: "old", lastAckOn: new Date("2026-11-23T00:00:00.000Z") })],
      "2026-11-24", 2, TZ, todayStart,
    );
    expect(out.map((r) => [r.id, r.ackedToday])).toEqual([["today", true], ["old", false]]);
  });

  it("sortsByDueAt", () => {
    const out = remindersForToday(
      [row({ id: "shake", hour: 15, minute: 0 }), row({ id: "vit", hour: 9, minute: 45 })],
      "2026-11-24", 2, TZ, todayStart,
    );
    expect(out.map((r) => r.id)).toEqual(["vit", "shake"]);
  });

  it("returnsOnlyTheFieldsTheMacUses", () => {
    const [r] = remindersForToday([row({ durationMin: 15, icon: "stretch", tier: "normal" })], "2026-11-24", 2, TZ, todayStart);
    expect(r).toEqual({
      id: "r", label: "Take vitamins", icon: "stretch", tier: "normal", durationMin: 15,
      dueAt: "2026-11-24T14:45:00.000Z", ackedToday: false,
    });
  });
});

describe("weekdayOf", () => {
  it("usesTimezoneWeekday", () => {
    expect(weekdayOf("2026-11-23")).toBe(1);
    expect(weekdayOf("2026-11-22")).toBe(0);
  });
});
