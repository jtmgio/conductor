"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task { id: string; title: string; priority: string; roleId: string; }
interface Role { id: string; name: string; color: string; }
interface MorningPickProps {
  tasksByRole: Array<{ role: Role; tasks: Task[] }>;
  roles: Role[];
  onConfirm: (selectedIds: string[]) => void;
  onSkip: () => void;
  onRefresh: () => void;
}

export function MorningPick({ tasksByRole, roles, onConfirm, onSkip, onRefresh }: MorningPickProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [localEdits, setLocalEdits] = useState<Map<string, { title?: string; roleId?: string }>>(new Map());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const editInputRef = useRef<HTMLInputElement>(null);

  // Poll for new tasks while morning pick is open (catches Cmd+K additions)
  useEffect(() => {
    const interval = setInterval(onRefresh, 3000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  const toggle = (id: string) => {
    if (editingId) return;
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const startEdit = (task: Task) => {
    const edits = localEdits.get(task.id);
    setEditingId(task.id);
    setEditValue(edits?.title ?? task.title);
    setEditRoleId(edits?.roleId ?? task.roleId);
  };

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    if (!trimmed) { setEditingId(null); return; }

    const updates: Record<string, string> = {};
    // Find original task
    const origTask = tasksByRole.flatMap(({ tasks }) => tasks).find((t) => t.id === editingId);
    const prevEdits = localEdits.get(editingId);
    const origTitle = prevEdits?.title ?? origTask?.title;
    const origRoleId = prevEdits?.roleId ?? origTask?.roleId;

    if (trimmed !== origTask?.title) updates.title = trimmed;
    if (editRoleId && editRoleId !== origTask?.roleId) updates.roleId = editRoleId;

    // Update local edits
    setLocalEdits((prev) => {
      const next = new Map(prev);
      next.set(editingId, {
        title: trimmed,
        roleId: editRoleId || origRoleId,
      });
      return next;
    });

    setEditingId(null);

    if (Object.keys(updates).length > 0) {
      await fetch(`/api/tasks/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      onRefresh();
    }
  }, [editingId, editValue, editRoleId, tasksByRole, localEdits, onRefresh]);

  const deleteTask = async (id: string) => {
    setDeletedIds((prev) => new Set(prev).add(id));
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  };

  useEffect(() => {
    if (editingId && editInputRef.current) editInputRef.current.focus();
  }, [editingId]);

  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Build display data: apply local edits (role reassignments) on top of prop data
  const allTasks = tasksByRole.flatMap(({ tasks }) => tasks);
  const displayByRole = roles
    .map((role) => {
      const tasks = allTasks
        .filter((t) => !deletedIds.has(t.id))
        .filter((t) => {
          const edits = localEdits.get(t.id);
          const effectiveRoleId = edits?.roleId ?? t.roleId;
          return effectiveRoleId === role.id;
        });
      return { role, tasks };
    })
    .filter(({ tasks }) => tasks.length > 0);

  const rolesWithTasks = new Set(displayByRole.map(({ role }) => role.id));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="fixed inset-0 z-[60] bg-[var(--surface)] overflow-y-auto">
      <div className="w-full px-5 pt-10 pb-36">
        <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">Morning Pick</p>
        <h1 className="text-[36px] font-bold text-[var(--text-primary)]">{dayName}</h1>
        <p className="text-[15px] text-[var(--text-tertiary)] mt-2 leading-relaxed">Pick the tasks you want to focus on today. Only selected tasks will show in Focus mode during each role&apos;s time block.</p>
        <div className="flex gap-1.5 mt-5 mb-10">
          {roles.map((role) => (
            <div key={role.id} className="flex-1 h-1 rounded-full" style={{ backgroundColor: rolesWithTasks.has(role.id) ? role.color : "rgba(255,255,255,0.1)" }} />
          ))}
        </div>
        <div className="space-y-6">
          {displayByRole.map(({ role, tasks }) => {
            const selectedCount = tasks.filter((t) => selected.has(t.id)).length;
            return (
              <div key={role.id}>
                <div className="flex items-center justify-between rounded-xl px-4 py-3 mb-2" style={{ backgroundColor: `${role.color}1a` }}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                    <span className="text-[16px] font-semibold" style={{ color: role.color }}>{role.name}</span>
                  </div>
                  <span className="text-[15px] text-[var(--text-tertiary)]">{selectedCount}/{tasks.length}</span>
                </div>
                <div className="space-y-0.5">
                  <AnimatePresence>
                    {tasks.map((task) => {
                      const edits = localEdits.get(task.id);
                      const displayTitle = edits?.title ?? task.title;
                      const picked = selected.has(task.id);
                      const isEditing = editingId === task.id;

                      return (
                        <motion.div
                          key={task.id}
                          layout
                          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                          transition={{ duration: 0.2 }}
                          className="group rounded-xl hover:bg-[var(--sidebar-hover)]"
                        >
                          {isEditing ? (
                            <div className="px-4 py-3 space-y-3">
                              {/* Role pills — number keys select role when title is empty */}
                              <div className="flex gap-1.5 flex-wrap">
                                {roles.map((r, i) => (
                                  <button
                                    key={r.id}
                                    onClick={() => setEditRoleId(r.id)}
                                    className={cn(
                                      "px-2.5 py-1 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5",
                                      editRoleId === r.id
                                        ? "text-white"
                                        : "border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                                    )}
                                    style={editRoleId === r.id ? { backgroundColor: r.color } : undefined}
                                  >
                                    <span className="text-[10px] opacity-50 font-mono">{i + 1}</span>
                                    {editRoleId !== r.id && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />}
                                    {r.name}
                                  </button>
                                ))}
                              </div>
                              {/* Title input + actions */}
                              <div className="flex items-center gap-2">
                                <input
                                  ref={editInputRef}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { saveEdit(); return; }
                                    if (e.key === "Escape") { setEditingId(null); return; }
                                    if (!editValue && !e.metaKey && !e.ctrlKey && !e.altKey) {
                                      const num = parseInt(e.key);
                                      if (num >= 1 && num <= roles.length) { e.preventDefault(); setEditRoleId(roles[num - 1].id); }
                                    }
                                  }}
                                  className="flex-1 min-w-0 text-[17px] text-[var(--text-primary)] bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20"
                                />
                                <button
                                  onClick={saveEdit}
                                  className="px-3 py-2 rounded-xl bg-[var(--accent-blue)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggle(task.id)}
                                className="flex items-center gap-3 flex-1 min-w-0 text-left px-4 py-3 active:scale-[0.99]"
                              >
                                {picked ? (
                                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: role.color }}><Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /></div>
                                ) : (
                                  <div className="w-6 h-6 rounded-lg border-2 border-[var(--border-default)] flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                  <span className={cn("text-[17px] truncate", picked ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>{displayTitle}</span>
                                  {task.priority === "urgent" && <span className="text-[13px] font-bold text-red-400 uppercase shrink-0">URGENT</span>}
                                </div>
                              </button>
                              <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => { e.stopPropagation(); startEdit(task); }}
                                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-400 hover:bg-[var(--surface-hover)] transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface)]/95 backdrop-blur-sm border-t border-[var(--border-subtle)] px-5 pb-[env(safe-area-inset-bottom)] pt-4">
        <div className="w-full space-y-2 pb-4">
          <button onClick={() => onConfirm(Array.from(selected))} disabled={selected.size === 0} className="w-full py-4 bg-[var(--accent-blue)] text-white text-[18px] font-semibold rounded-2xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">Go &rarr;</button>
          <button onClick={onSkip} className="w-full text-center text-[16px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] py-2 transition-colors">Skip</button>
        </div>
      </div>
    </motion.div>
  );
}
