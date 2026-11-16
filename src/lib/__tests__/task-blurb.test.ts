import { describe, expect, it } from "vitest";
import { taskBlurb } from "@/lib/task-blurb";

describe("taskBlurb", () => {
  it("is null with no notes", () => {
    expect(taskBlurb(null, "Ship it")).toBeNull();
    expect(taskBlurb("  \n ", "Ship it")).toBeNull();
  });

  it("drops the Why: label and keeps the purpose", () => {
    expect(taskBlurb("Why: Venu needs the numbers before the budget review.\n\nSend both links.", "x"))
      .toBe("Venu needs the numbers before the budget review. Send both links.");
  });

  it("flattens markdown and line breaks into one readable line", () => {
    expect(taskBlurb("## Context\n- **Bucket** delivered `11/4`\n- [ ] test it", "x"))
      .toBe("Context Bucket delivered 11/4 test it");
  });

  it("is null when the notes only repeat the title", () => {
    expect(taskBlurb("Deploy Defense Hub to production.", "Deploy Defense Hub to production")).toBeNull();
  });
});
