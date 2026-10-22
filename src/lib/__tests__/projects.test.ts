import { describe, expect, it } from "vitest";
import { matchProject, projectIdAfterRoleChange } from "@/lib/projects";

const P = (id: string, name: string) => ({ id, name });
const projects = [P("p1", "AWS cost"), P("p2", "Ops chat"), P("p3", "Ops dashboard"), P("p4", "Logs / Kibana replacement"), P("p5", "Ops")];

describe("matchProject", () => {
  it("matches by id", () => {
    expect(matchProject(projects, "p2", "vQuip").name).toBe("Ops chat");
  });

  it("matches an exact name", () => {
    expect(matchProject(projects, "AWS cost", "vQuip").id).toBe("p1");
  });

  it("matches a name case-insensitively", () => {
    expect(matchProject(projects, "aws cost", "vQuip").id).toBe("p1");
  });

  it("prefers an exact match over a partial one", () => {
    expect(matchProject(projects, "Ops", "vQuip").id).toBe("p5");
  });

  it("takes a unique partial match", () => {
    expect(matchProject(projects, "kibana", "vQuip").id).toBe("p4");
  });

  it("refuses an ambiguous partial match and names every candidate", () => {
    const two = [P("a", "Ops chat"), P("b", "Ops dashboard")];
    expect(() => matchProject(two, "ops", "vQuip")).toThrow(/Ops chat.*Ops dashboard/);
  });

  it("refuses an unknown name and lists the company's projects", () => {
    expect(() => matchProject(projects, "Marin", "vQuip")).toThrow(/vQuip.*AWS cost.*Ops chat/);
  });

  it("says so when the company has no projects yet", () => {
    expect(() => matchProject([], "Marin", "vQuip")).toThrow(/vQuip has no projects yet/);
  });
});

describe("projectIdAfterRoleChange", () => {
  it("clears the project when the task moves company without a new one", () => {
    expect(projectIdAfterRoleChange({ roleChanged: true, currentProjectId: "p1", requestedProjectId: undefined })).toBeNull();
  });

  it("uses the requested project when the task moves company with one", () => {
    expect(projectIdAfterRoleChange({ roleChanged: true, currentProjectId: "p1", requestedProjectId: "p9" })).toBe("p9");
  });

  it("leaves the column alone when nothing about the project changes", () => {
    expect(projectIdAfterRoleChange({ roleChanged: false, currentProjectId: "p1", requestedProjectId: undefined })).toBeUndefined();
  });

  it("removes the project when null is requested", () => {
    expect(projectIdAfterRoleChange({ roleChanged: false, currentProjectId: "p1", requestedProjectId: null })).toBeNull();
  });
});
