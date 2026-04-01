"use client";

import { cn } from "@/lib/utils";

interface Role { id: string; name: string; color: string; }
interface RoleTabsProps { roles: Role[]; activeRoleId: string; onChange: (roleId: string) => void; }

export function RoleTabs({ roles, activeRoleId, onChange }: RoleTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-4">
      {roles.map((role) => {
        const active = role.id === activeRoleId;
        return (
          <button key={role.id} onClick={() => onChange(role.id)}
            className={cn("flex-shrink-0 px-4 py-1.5 rounded-full text-[14px] font-medium transition-colors min-h-[44px] flex items-center gap-1.5",
              active ? "text-white" : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
            )}
            style={active ? { backgroundColor: role.color } : undefined}
          >
            {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />}
            {role.name}
          </button>
        );
      })}
    </div>
  );
}
