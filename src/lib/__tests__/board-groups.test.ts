import { describe, expect, it } from "vitest";
import { groupBoard } from "@/lib/board-groups";

const zeta = { id: "r1", name: "Zeta", color: "#1", priority: 1 };
const vquip = { id: "r2", name: "vQuip", color: "#2", priority: 2 };
const row = (id: string, role: typeof zeta, project: { id: string; name: string } | null) => ({ id, role, project });

describe("groupBoard", () => {
  it("orders companies by priority regardless of row order", () => {
    const g = groupBoard([row("a", vquip, null), row("b", zeta, null)]);
    expect(g.map((c) => c.name)).toEqual(["Zeta", "vQuip"]);
  });
  it("orders projects A to Z, case-insensitive, loose last", () => {
    const g = groupBoard([row("a", vquip, null), row("b", vquip, { id: "p2", name: "ops dashboard" }), row("c", vquip, { id: "p1", name: "AWS cost" })]);
    expect(g[0].projects.map((p) => p.name)).toEqual(["AWS cost", "ops dashboard", null]);
  });
  it("keeps the incoming row order inside a group", () => {
    const g = groupBoard([row("first", vquip, { id: "p1", name: "A" }), row("second", vquip, { id: "p1", name: "A" })]);
    expect(g[0].projects[0].rows.map((r) => r.id)).toEqual(["first", "second"]);
  });
  it("a company with only loose tasks still gets a group", () => {
    const g = groupBoard([row("a", zeta, null)]);
    expect(g).toHaveLength(1);
    expect(g[0].projects[0].projectId).toBeNull();
  });
  it("returns nothing for no rows", () => {
    expect(groupBoard([])).toEqual([]);
  });
});
