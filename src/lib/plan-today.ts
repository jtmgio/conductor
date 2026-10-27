// Planning today from a project session: which earlier picks a re-plan drops.
// Pure on purpose — dates come in as YYYY-MM-DD strings so it can be tested
// without a database. `replace` must never touch another project's plan, so the
// clear set is scoped to the projects the new picks belong to.

export interface PlanCandidate {
  id: string;
  projectId: string | null;
  done: boolean;
  scheduledFor: string | null; // YYYY-MM-DD
}

/** Ids whose scheduledFor should be cleared before planning: open tasks planned for `today`, in the same project(s) as the picks, not themselves picks. */
export function planClearSet(picks: PlanCandidate[], candidates: PlanCandidate[], today: string): string[] {
  const pickIds = new Set(picks.map((p) => p.id));
  // Loose tasks (null project) are their own bucket, so a loose pick clears only loose tasks.
  const projects = new Set(picks.map((p) => p.projectId));
  return candidates
    .filter((t) => !t.done && t.scheduledFor === today && !pickIds.has(t.id) && projects.has(t.projectId))
    .map((t) => t.id);
}
