// The one-line description under a task on the board: the notes, flattened.
// The row clamps it to two lines, so this only cleans; it never cuts.

export function taskBlurb(notes: string | null | undefined, title: string): string | null {
  if (!notes) return null;
  const text = notes
    .replace(/^\s*Why:\s*/i, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+(\[[ xX]\]\s+)?/gm, "")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (norm(text) === norm(title)) return null;
  return text;
}
