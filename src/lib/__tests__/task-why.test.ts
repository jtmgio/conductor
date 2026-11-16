import { describe, expect, it } from "vitest";
import { checkWhy, notesWithWhy, WHY_MIN_WORDS } from "@/lib/task-why";

const good =
  "Venu asked for the cost numbers before the budget review. Done when he has the sheet and the Confluence page link in Slack.";

describe("checkWhy", () => {
  it("accepts a why that says what it's for and what done looks like", () => {
    expect(checkWhy(good)).toEqual({ ok: true, why: good });
  });

  it("refuses a missing why", () => {
    expect(checkWhy(undefined).ok).toBe(false);
    expect(checkWhy("   ").ok).toBe(false);
  });

  it(`refuses a why under ${WHY_MIN_WORDS} words`, () => {
    const r = checkWhy("Send the cost sheet to Venu.");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/words/);
  });

  it("trims whitespace", () => {
    const r = checkWhy(`  ${good}  `);
    expect(r.ok && r.why).toBe(good);
  });
});

describe("notesWithWhy", () => {
  it("puts the why first, then the refined notes", () => {
    expect(notesWithWhy(good, "Send both links.")).toBe(`Why: ${good}\n\nSend both links.`);
  });

  it("stands alone when there are no notes", () => {
    expect(notesWithWhy(good, null)).toBe(`Why: ${good}`);
  });
});
