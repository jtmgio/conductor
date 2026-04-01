export interface TimeBlock {
  id: string;
  label: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  getRoleId: (dayOfWeek: number) => string | null;
}

const BLOCKS: TimeBlock[] = [
  {
    id: "b1",
    label: "Deep Work",
    startHour: 7, startMinute: 30,
    endHour: 10, endMinute: 0,
    getRoleId: (day) => [1, 3, 5].includes(day) ? "zeta" : [2, 4].includes(day) ? "healthmap" : null,
  },
  {
    id: "b2",
    label: "Triage",
    startHour: 10, startMinute: 0,
    endHour: 10, endMinute: 30,
    getRoleId: () => "zeta", // triage — defaults to highest priority
  },
  {
    id: "b3",
    label: "vQuip Block",
    startHour: 10, startMinute: 30,
    endHour: 15, endMinute: 0,
    getRoleId: () => "vquip",
  },
  {
    id: "b4",
    label: "Afternoon",
    startHour: 15, startMinute: 0,
    endHour: 16, endMinute: 0,
    getRoleId: (day) => [1, 3].includes(day) ? "healthmap" : [2, 4, 5].includes(day) ? "healthme" : null,
  },
  {
    id: "b5",
    label: "Late Afternoon",
    startHour: 16, startMinute: 0,
    endHour: 17, endMinute: 0,
    getRoleId: (day) => [1, 3].includes(day) ? "healthme" : [2, 4, 5].includes(day) ? "xenegrade" : null,
  },
  {
    id: "b6",
    label: "Evening",
    startHour: 19, startMinute: 0,
    endHour: 20, endMinute: 0,
    getRoleId: (day) => [1, 3].includes(day) ? "xenegrade" : [2, 4, 5].includes(day) ? "reacthealth" : null,
  },
];

export function getAllBlocks(): TimeBlock[] {
  return BLOCKS;
}

function timeToMinutes(h: number, m: number): number {
  return h * 60 + m;
}

export function getCurrentBlock(now?: Date): { block: TimeBlock; roleId: string | null } | null {
  const d = now || new Date();
  const currentMinutes = timeToMinutes(d.getHours(), d.getMinutes());
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon...

  for (const block of BLOCKS) {
    const start = timeToMinutes(block.startHour, block.startMinute);
    const end = timeToMinutes(block.endHour, block.endMinute);
    if (currentMinutes >= start && currentMinutes < end) {
      return { block, roleId: block.getRoleId(dayOfWeek) };
    }
  }
  return null;
}

export function getNextBlocks(count: number = 3, now?: Date): Array<{ block: TimeBlock; roleId: string | null }> {
  const d = now || new Date();
  const currentMinutes = timeToMinutes(d.getHours(), d.getMinutes());
  const dayOfWeek = d.getDay();
  const results: Array<{ block: TimeBlock; roleId: string | null }> = [];

  for (const block of BLOCKS) {
    const start = timeToMinutes(block.startHour, block.startMinute);
    if (start > currentMinutes) {
      results.push({ block, roleId: block.getRoleId(dayOfWeek) });
      if (results.length >= count) break;
    }
  }
  return results;
}

export function getTimeLabel(block: TimeBlock): string {
  const fmt = (h: number, m: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
  };
  return `${fmt(block.startHour, block.startMinute)} – ${fmt(block.endHour, block.endMinute)}`;
}

export function getOffClockMessage(now?: Date): string | null {
  const d = now || new Date();
  const currentMinutes = timeToMinutes(d.getHours(), d.getMinutes());
  const dayOfWeek = d.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) return "Weekend. Rest up.";
  if (currentMinutes < timeToMinutes(7, 30)) return "Day starts at 7:30 AM";
  if (currentMinutes >= timeToMinutes(17, 0) && currentMinutes < timeToMinutes(19, 0)) return "Family time";
  if (currentMinutes >= timeToMinutes(20, 0)) return "Done for today";
  return null;
}

export type { TimeBlock as Block };
