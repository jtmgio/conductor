/**
 * Who owns the screen right now.
 *
 * Four blocking overlays mount as peers in AppShell — Reminders, MeetingAlert,
 * CommsSweepAlert and BlockTransition — and none of them knew the others
 * existed. Reminders and MeetingAlert both rendered at z-[80], so DOM order
 * silently decided which one you saw, and dismissing the top one revealed a
 * second you never knew was queued. GlobalSearch sat at z-[60], *below* all of
 * them, so ⌘K during an alert opened the palette behind an opaque backdrop and
 * you typed into a field you couldn't see.
 *
 * This is the small version of the fix: one shared registry plus a fixed
 * priority ladder. It doesn't serialise the alerts into a queue (that's the
 * larger refactor), but it does make the stacking deliberate and gives
 * everything else one thing to ask: is an alert up?
 */

/** Higher wins the screen. Kept here so the ordering is readable in one place. */
export const ALERT_Z = {
  commsSweep: 76,
  blockTransition: 80,
  reminder: 84,
  meeting: 88,
} as const;

export type AlertName = keyof typeof ALERT_Z;

const open = new Set<AlertName>();

/** Marks the body so non-React code (and CSS) can see that an alert is up. */
function sync(): void {
  if (typeof document === "undefined") return;
  if (open.size) document.body.setAttribute("data-alert-open", "true");
  else document.body.removeAttribute("data-alert-open");
}

export function acquireAlert(name: AlertName): void {
  open.add(name);
  sync();
}

export function releaseAlert(name: AlertName): void {
  open.delete(name);
  sync();
}

/** True when any blocking overlay is on screen. */
export function isAlertOpen(): boolean {
  return open.size > 0;
}

/**
 * True when something outranks `name`. A component uses this to stay mounted
 * (keeping its timers and state) while yielding the screen — rather than the
 * old behaviour, where it painted underneath and its key handlers kept firing.
 */
export function isOutranked(name: AlertName): boolean {
  const mine = ALERT_Z[name];
  let beaten = false;
  open.forEach((other) => {
    if (ALERT_Z[other] > mine) beaten = true;
  });
  return beaten;
}
