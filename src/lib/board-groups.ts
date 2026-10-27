// Reading order for the widened dispatch board: company, then project, then the
// rows in the order the server ranked them. Pure, and carries no counts.

export interface GroupableRow {
  id: string;
  role: { id: string; name: string; color: string; priority: number };
  project: { id: string; name: string } | null;
}

/** name null = loose (no project). */
export interface ProjectGroup<T> {
  projectId: string | null;
  name: string | null;
  rows: T[];
}

export interface CompanyGroup<T> {
  roleId: string;
  name: string;
  color: string;
  projects: ProjectGroup<T>[];
}

/** Company by Role.priority, project A→Z (base sensitivity) with loose last; rows keep their incoming order. */
export function groupBoard<T extends GroupableRow>(rows: T[]): CompanyGroup<T>[] {
  const companies = new Map<string, { group: CompanyGroup<T>; priority: number; byProject: Map<string | null, ProjectGroup<T>> }>();

  for (const row of rows) {
    let company = companies.get(row.role.id);
    if (!company) {
      company = {
        group: { roleId: row.role.id, name: row.role.name, color: row.role.color, projects: [] },
        priority: row.role.priority,
        byProject: new Map(),
      };
      companies.set(row.role.id, company);
    }
    const projectId = row.project?.id ?? null;
    let project = company.byProject.get(projectId);
    if (!project) {
      project = { projectId, name: row.project?.name ?? null, rows: [] };
      company.byProject.set(projectId, project);
    }
    project.rows.push(row);
  }

  const byName = (a: ProjectGroup<T>, b: ProjectGroup<T>) => {
    // Loose has no name to sort on; it reads last.
    if (a.name === null) return b.name === null ? 0 : 1;
    if (b.name === null) return -1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  };

  return Array.from(companies.values())
    .sort((a, b) => a.priority - b.priority)
    .map(({ group, byProject }) => ({ ...group, projects: Array.from(byProject.values()).sort(byName) }));
}
