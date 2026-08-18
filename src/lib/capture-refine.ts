// Async task refine for the v2 capture surfaces. The task is created verbatim first
// (instant, never blocks), then this tidies it in the background via the local MLX
// refine (/api/tasks/refine → short title, notes, checklist, due date) and PUTs the
// result onto the existing task. scheduledFor / status are left untouched.

export interface RefinedFields {
  title: string;
  notes?: string | null;
  checklist?: unknown;
  dueDate?: string | null;
}

export function refineTaskInBackground(
  taskId: string,
  rawText: string,
  roleId: string,
  onRefined?: (r: RefinedFields) => void,
  onSettled?: () => void // always fires, even when refine fails — for clearing spinners
): void {
  fetch("/api/tasks/refine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText, roleId }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const r = data?.refined as RefinedFields | undefined;
      if (!r || !r.title) return;
      return fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: r.title,
          notes: r.notes ?? undefined,
          checklist: r.checklist ?? undefined,
          dueDate: r.dueDate ?? undefined,
        }),
      }).then(() => onRefined?.(r));
    })
    .catch(() => {})
    .finally(() => onSettled?.());
}
