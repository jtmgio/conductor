import { prisma } from "@/lib/prisma";
import { today } from "@/lib/dates";
import { invalidateRebalanceCache } from "@/lib/schedule-rebalance";

/**
 * End of day is silent.
 *
 * CLAUDE.md, critical UX rule #6: "Incomplete today-tasks quietly return to
 * backlog. No summary, no guilt."
 *
 * That rule has not actually been implemented since v2. The old per-device
 * reset was removed (see the note in AppShell) because it ran off localStorage,
 * so opening a second machine wiped the plan you made on the first — and the
 * server-side replacement was never built. The effect was the opposite of the
 * rule: instead of clearing overnight, unfinished work silently *accumulated*
 * on today. On 2026-08-21 that meant 29 tasks sat on "today" of which only 9
 * had been scheduled that day; the rest were leftovers from the 18th and 20th.
 *
 * This runs server-side so it is per-account, not per-device, and it only ever
 * touches tasks scheduled STRICTLY BEFORE today — a plan you made this morning
 * is never cleared out from under you.
 *
 * Deliberately not done here: no notification, no count returned to the UI, no
 * "you didn't finish 20 things" anywhere. Silence is the feature.
 */

/** Guards against re-running within the same day, and across restarts. */
let lastRunKey: string | null = null;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export async function rolloverIfNewDay(): Promise<void> {
  const target = today();
  const key = dayKey(target);

  // Cheap in-process guard so this doesn't hit the DB on every request.
  if (lastRunKey === key) return;

  const profile = await prisma.userProfile.findUnique({
    where: { id: "default" },
    select: { lastRolloverOn: true },
  });

  if (profile?.lastRolloverOn && dayKey(profile.lastRolloverOn) === key) {
    lastRunKey = key;
    return;
  }

  // scheduledFor < today, not done. Today's own plan is untouched.
  const { count } = await prisma.task.updateMany({
    where: { scheduledFor: { lt: target }, done: false },
    data: { scheduledFor: null },
  });

  await prisma.userProfile.upsert({
    where: { id: "default" },
    update: { lastRolloverOn: target },
    create: { id: "default", lastRolloverOn: target },
  });

  lastRunKey = key;
  if (count > 0) invalidateRebalanceCache();
}
