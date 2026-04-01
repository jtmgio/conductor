"use client";

interface Role { id: string; name: string; color: string; }

const BLOCKS = [
  { id: "b1", label: "7:30\u201310", defaultRole: (day: number) => [1, 3, 5].includes(day) ? "zeta" : "healthmap" },
  { id: "b2", label: "10\u201310:30", defaultRole: () => "zeta" },
  { id: "b3", label: "10:30\u20133", defaultRole: () => "vquip" },
  { id: "b4", label: "3\u20134", defaultRole: (day: number) => [1, 3].includes(day) ? "healthmap" : "healthme" },
  { id: "b5", label: "4\u20135", defaultRole: (day: number) => [1, 3].includes(day) ? "healthme" : "xenegrade" },
  { id: "b6", label: "7\u20138 PM", defaultRole: (day: number) => [1, 3].includes(day) ? "xenegrade" : "reacthealth" },
];

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
];

interface ScheduleGridProps { roles: Role[]; }

export function ScheduleGrid({ roles }: ScheduleGridProps) {
  const roleMap = Object.fromEntries(roles.map((r) => [r.id, r]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left py-2 px-1 text-[var(--text-tertiary)] font-medium">Block</th>
            {DAYS.map((day) => (
              <th key={day.value} className="text-center py-2 px-1 text-[var(--text-tertiary)] font-medium">{day.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BLOCKS.map((block) => (
            <tr key={block.id} className="border-t border-[var(--border-subtle)]">
              <td className="py-2 px-1 text-[var(--text-secondary)] whitespace-nowrap">{block.label}</td>
              {DAYS.map((day) => {
                const roleId = block.defaultRole(day.value);
                const role = roleId ? roleMap[roleId] : null;
                return (
                  <td key={day.value} className="py-2 px-1 text-center">
                    {role ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: `${role.color}1a`, color: role.color }}>
                        {role.name}
                      </span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">&mdash;</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
