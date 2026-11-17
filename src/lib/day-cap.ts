// A company can plan at most DAY_CAP tasks onto one day, so each company's
// day stays finishable. Counted per company, never across them, so a session
// never learns what another company has planned.

export const DAY_CAP = 5;

export type DayCapCheck = { ok: true } | { ok: false; planned: number; adding: number };

/** alreadyPlanned: open task ids in this company already on that day. adding: ids being planned onto it. */
export function checkDayCap(alreadyPlanned: string[], adding: string[]): DayCapCheck {
  const existing = new Set(alreadyPlanned);
  const fresh = new Set(adding.filter((id) => !existing.has(id)));
  if (existing.size + fresh.size <= DAY_CAP) return { ok: true };
  return { ok: false, planned: existing.size, adding: fresh.size };
}
