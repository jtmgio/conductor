/**
 * Human-addressable task keys — VQ-14, WRI-3, or an upstream key like MED-54.
 *
 * The point of these is conversational: "close WRI-12" instead of pasting a cuid.
 * They show up in the UI, in search, and in every MCP response.
 */

/** A task carries either its own number or an upstream system's key. */
export interface KeyedTask {
  number?: number | null;
  externalKey?: string | null;
}
export interface KeyedRole {
  taskPrefix?: string | null;
}

/** Render a task's display key, or null if it has neither (shouldn't happen post-backfill). */
export function taskKey(task: KeyedTask, role: KeyedRole | null | undefined): string | null {
  if (task.externalKey) return task.externalKey;
  if (task.number != null && role?.taskPrefix) return `${role.taskPrefix}-${task.number}`;
  return null;
}

/**
 * Derive a prefix from a company name. Splits on separators AND camelCase humps so
 * "vQuip" -> VQ and "HealthMe" -> HM, then falls back to the first 3 letters for
 * single-word names ("Wris" -> WRI). Caller must still enforce uniqueness.
 */
export function derivePrefix(name: string): string {
  const parts = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const raw =
    parts.length >= 2
      ? parts.slice(0, 3).map((p) => p[0]).join("")
      : (parts[0] || name).slice(0, 3);
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length >= 2 ? clean.slice(0, 4) : (clean + "XX").slice(0, 2);
}

/** Pick a prefix not already in `taken` (case-insensitive), widening then numbering. */
export function uniquePrefix(name: string, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toUpperCase()));
  const base = derivePrefix(name);
  if (!used.has(base)) return base;

  // Try widening with more letters from the name before resorting to digits.
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (let len = base.length + 1; len <= 4 && len <= letters.length; len++) {
    const cand = letters.slice(0, len);
    if (!used.has(cand)) return cand;
  }
  for (let n = 2; n < 100; n++) {
    const cand = `${base.slice(0, 3)}${n}`;
    if (!used.has(cand)) return cand;
  }
  return base; // pathological; unique constraint will surface it
}

/**
 * Matches a display key like "VQ-14", "MED-54", or "G-105".
 *
 * Deliberately loose on prefix length: Conductor mints 2-4 chars, but externalKey
 * carries whatever the upstream tracker uses — including single-letter team keys.
 * Callers treat a match as "worth looking up", not as proof the task exists.
 */
const KEY_RE = /^([A-Z][A-Z0-9]{0,9})-(\d+)$/i;

export function parseTaskKey(input: string): { prefix: string; number: number } | null {
  const m = input.trim().match(KEY_RE);
  if (!m) return null;
  return { prefix: m[1].toUpperCase(), number: parseInt(m[2], 10) };
}

/** True if a string looks like a key rather than a cuid — used to route MCP lookups. */
export function looksLikeTaskKey(input: string): boolean {
  return KEY_RE.test(input.trim());
}
