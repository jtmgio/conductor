import { describe, expect, it } from "vitest";
import { CONDUCTOR_MCP_INSTRUCTIONS } from "@/lib/mcp-instructions";

describe("CONDUCTOR_MCP_INSTRUCTIONS", () => {
  it("stays under 300 words — it loads into every session in every repo", () => {
    expect(CONDUCTOR_MCP_INSTRUCTIONS.trim().split(/\s+/).length).toBeLessThanOrEqual(300);
  });

  it("names the tools and fields the rules depend on", () => {
    for (const term of ["get_today_walk", "list_projects", "notBefore", "create_followup"]) {
      expect(CONDUCTOR_MCP_INSTRUCTIONS).toContain(term);
    }
  });

  it("asks about past-due work instead of presenting it", () => {
    expect(CONDUCTOR_MCP_INSTRUCTIONS).toContain("did this happen");
  });

  it("gives 'still to do' an action, so the same task isn't asked about every day", () => {
    expect(CONDUCTOR_MCP_INSTRUCTIONS).toMatch(/still to do[^.]*(isToday|dueDate)/);
  });

  it("asks about past-due work when the walk reaches it, not before urgent work", () => {
    expect(CONDUCTOR_MCP_INSTRUCTIONS).not.toMatch(/pastDue tasks first/);
  });

  it("keeps a command center to its own company", () => {
    expect(CONDUCTOR_MCP_INSTRUCTIONS).toContain("pass the role of the command center you are in");
  });

  it("names the board and the owner field", () => {
    for (const term of ["get_board", "owner"]) expect(CONDUCTOR_MCP_INSTRUCTIONS).toContain(term);
  });

  it("drops the firewall only in the home folder", () => {
    expect(CONDUCTOR_MCP_INSTRUCTIONS).toMatch(/home folder/i);
    expect(CONDUCTOR_MCP_INSTRUCTIONS).not.toMatch(/no company role has no firewall/);
  });
});
