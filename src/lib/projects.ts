// Project lookups for the MCP surface. Pure — the route loads one company's
// projects and hands them in, so a name can never resolve to another company's.

export interface ProjectRef {
  id: string;
  name: string;
}

/**
 * Resolve a project by id or name inside one company: exact, then
 * case-insensitive, then partial. A partial that hits two projects is refused
 * rather than guessed — filing a task into the wrong project hides it.
 */
export function matchProject<T extends ProjectRef>(projects: T[], ref: string, roleName: string): T {
  const raw = ref.trim();
  const lower = raw.toLowerCase();
  const exact =
    projects.find((p) => p.id === raw) ||
    projects.find((p) => p.name === raw) ||
    projects.find((p) => p.name.toLowerCase() === lower);
  if (exact) return exact;

  const partial = projects.filter((p) => p.name.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`Project "${raw}" matches more than one in ${roleName}: ${partial.map((p) => p.name).join(", ")}. Use the full name.`);
  }
  if (projects.length === 0) throw new Error(`Unknown project "${raw}" — ${roleName} has no projects yet.`);
  throw new Error(`Unknown project "${raw}" in ${roleName}. Projects: ${projects.map((p) => p.name).join(", ")}`);
}

/**
 * What a task's projectId becomes on update. `undefined` means leave the column
 * alone. Moving a task to another company drops its project unless a new one is
 * given — a project never spans companies.
 */
export function projectIdAfterRoleChange(args: {
  roleChanged: boolean;
  currentProjectId: string | null;
  requestedProjectId: string | null | undefined;
}): string | null | undefined {
  if (args.requestedProjectId !== undefined) return args.requestedProjectId;
  return args.roleChanged ? null : undefined;
}
