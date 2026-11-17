// The date labels on a board row. A planned day (scheduledFor) and a deadline
// (dueDate) are different facts, so a row shows each one — otherwise a task
// planned for today looks undated, or dated only by its later deadline.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function label(ymd: string, today: string): string {
  if (ymd === today) return "today";
  const [, m, d] = ymd.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function rowDates(
  scheduledFor: string | null | undefined,
  dueDate: string | null | undefined,
  today: string,
): { planned: string | null; due: string | null } {
  const planned = scheduledFor ? scheduledFor.slice(0, 10) : null;
  const due = dueDate ? dueDate.slice(0, 10) : null;
  const dueLabel = due ? `due ${label(due, today)}` : null;
  if (planned && planned !== due) {
    const p = label(planned, today);
    return { planned: p === "today" ? "Today" : p, due: dueLabel };
  }
  return { planned: null, due: dueLabel };
}
