"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task { id: string; title: string; priority: string; roleId: string; }
interface Role { id: string; name: string; color: string; }
interface MorningPickProps { tasksByRole: Array<{ role: Role; tasks: Task[] }>; onConfirm: (selectedIds: string[]) => void; onSkip: () => void; }

const ALL_ROLE_IDS = ["zeta", "healthmap", "vquip", "healthme", "xenegrade", "reacthealth"];
const ROLE_COLORS: Record<string, string> = { zeta: "#4d8ef7", healthmap: "#2dd4bf", vquip: "#a78bfa", healthme: "#fbbf24", xenegrade: "#a8a29e", reacthealth: "#fb7185" };

export function MorningPick({ tasksByRole, onConfirm, onSkip }: MorningPickProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => { setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const rolesWithTasks = new Set(tasksByRole.map(({ role }) => role.id));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="fixed inset-0 z-[60] bg-[var(--surface)] overflow-y-auto">
      <div className="max-w-[480px] mx-auto px-5 pt-10 pb-36">
        <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">Morning Pick</p>
        <h1 className="text-[32px] font-bold text-[var(--text-primary)]">{dayName}</h1>
        <div className="flex gap-1.5 mt-5 mb-10">
          {ALL_ROLE_IDS.map((roleId) => (
            <div key={roleId} className="flex-1 h-1 rounded-full" style={{ backgroundColor: rolesWithTasks.has(roleId) ? ROLE_COLORS[roleId] : "rgba(255,255,255,0.1)" }} />
          ))}
        </div>
        <div className="space-y-6">
          {tasksByRole.map(({ role, tasks }) => {
            const selectedCount = tasks.filter((t) => selected.has(t.id)).length;
            return (
              <div key={role.id}>
                <div className="flex items-center justify-between rounded-xl px-4 py-3 mb-2" style={{ backgroundColor: `${role.color}1a` }}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                    <span className="text-[15px] font-semibold" style={{ color: role.color }}>{role.name}</span>
                  </div>
                  <span className="text-[14px] text-[var(--text-tertiary)]">{selectedCount}/{tasks.length}</span>
                </div>
                <div className="space-y-0.5">
                  {tasks.map((task) => {
                    const picked = selected.has(task.id);
                    return (
                      <button key={task.id} onClick={() => toggle(task.id)} className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl transition-colors hover:bg-[var(--sidebar-hover)] active:scale-[0.99]">
                        {picked ? (
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: role.color }}><Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /></div>
                        ) : (
                          <div className="w-6 h-6 rounded-lg border-2 border-[var(--border-default)] flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <span className={cn("text-base truncate", picked ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>{task.title}</span>
                          {task.priority === "urgent" && <span className="text-[12px] font-bold text-red-400 uppercase shrink-0">URGENT</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface)]/95 backdrop-blur-sm border-t border-[var(--border-subtle)] px-5 pb-[env(safe-area-inset-bottom)] pt-4">
        <div className="max-w-[480px] mx-auto space-y-2 pb-4">
          <button onClick={() => onConfirm(Array.from(selected))} disabled={selected.size === 0} className="w-full py-4 bg-[var(--accent-blue)] text-white font-semibold rounded-2xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">Go &rarr;</button>
          <button onClick={onSkip} className="w-full text-center text-[14px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] py-2 transition-colors">Skip</button>
        </div>
      </div>
    </motion.div>
  );
}
