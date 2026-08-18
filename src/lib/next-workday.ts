/**
 * The next working day, for deferring a task off today.
 *
 * Skips the weekend the same way PlanTomorrowPage's target does — Friday defers to Monday,
 * not to Saturday, because a task parked on a day you don't work is a task you won't see.
 * Client-safe (no TIMEZONE env, no Prisma): the browser's local day is the one the user
 * means when they say "tomorrow".
 */
export function nextWorkday(from: Date = new Date()): { iso: string; label: string } {
  const dow = from.getDay(); // 0=Sun .. 6=Sat
  const skip = dow === 5 ? 3 : dow === 6 ? 2 : 1; // Fri->Mon, Sat->Mon, otherwise next day
  const d = new Date(from);
  d.setDate(d.getDate() + skip);

  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const label = skip === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long" });
  return { iso, label };
}
