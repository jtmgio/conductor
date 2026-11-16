// A task filed by a Claude session must say what it is for. The refiner can only
// expand what it is given, so a one-line ask comes back as notes that repeat the
// title (ZG-226). The server refuses instead, and the session asks Josh.

export const WHY_MIN_WORDS = 15;

export type WhyCheck = { ok: true; why: string } | { ok: false; reason: string };

export function checkWhy(why: string | undefined): WhyCheck {
  const text = (why ?? "").trim();
  if (!text) return { ok: false, reason: "why is missing" };
  const words = text.split(/\s+/).length;
  if (words < WHY_MIN_WORDS) {
    return { ok: false, reason: `why is ${words} words; it needs at least ${WHY_MIN_WORDS}` };
  }
  return { ok: true, why: text };
}

/** The why leads the notes, so the first thing on the card is what it's for. */
export function notesWithWhy(why: string, notes: string | null | undefined): string {
  return notes ? `Why: ${why}\n\n${notes}` : `Why: ${why}`;
}
