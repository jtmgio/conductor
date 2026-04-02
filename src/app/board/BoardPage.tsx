"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Trash2, Plus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { STATUS_CONFIG, STATUS_ORDER } from "@/components/TaskItem";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const DONE_COL = {
  label: "done",
  bg: "rgba(34,197,94,0.12)",
  text: "#22c55e",
};

interface TagRelation {
  tag: { id: string; name: string; color: string };
}

interface ChecklistItem {
  text: string;
  done: boolean;
}

interface BoardTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  roleId: string;
  notes?: string | null;
  dueDate?: string | null;
  checklist?: ChecklistItem[] | null;
  tags?: TagRelation[];
  role: { id: string; name: string; color: string };
}

interface Role {
  id: string;
  name: string;
  color: string;
  priority: number;
}

type BoardData = Record<string, BoardTask[]>;

export function BoardPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRoleId, setActiveRoleId] = useState("");
  const [board, setBoard] = useState<BoardData>({});
  const [loading, setLoading] = useState(true);
  const [mobileFilter, setMobileFilter] = useState<string>("all");
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setRoles(arr);
        if (arr.length > 0) setActiveRoleId(arr[0].id);
      })
      .catch(() => {});
  }, []);

  const loadBoard = useCallback(async (roleId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/board?roleId=${roleId}`);
      const data = await res.json();
      setBoard(data);
    } catch {
      toast("Failed to load board", "error");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (activeRoleId) loadBoard(activeRoleId);
  }, [activeRoleId, loadBoard]);

  const changeStatus = async (taskId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      // Move task between columns locally
      setBoard((prev) => {
        const updated = { ...prev };
        let task: BoardTask | undefined;
        for (const key of STATUS_ORDER) {
          const idx = updated[key]?.findIndex((t) => t.id === taskId);
          if (idx !== undefined && idx >= 0) {
            task = { ...updated[key][idx], status: newStatus };
            updated[key] = updated[key].filter((_, i) => i !== idx);
            break;
          }
        }
        if (task) {
          updated[newStatus] = [...(updated[newStatus] || []), task];
        }
        return updated;
      });
    } catch {
      toast("Failed to update status", "error");
    }
  };

  const updateTask = async (taskId: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      // Update local state instead of reloading
      setBoard((prev) => {
        const updated = { ...prev };
        for (const key of STATUS_ORDER) {
          if (updated[key]) {
            updated[key] = updated[key].map((t) =>
              t.id === taskId ? { ...t, ...data } as BoardTask : t
            );
          }
        }
        return updated;
      });
    } catch {
      toast("Failed to update task", "error");
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      setBoard((prev) => {
        const updated = { ...prev };
        for (const key of STATUS_ORDER) {
          if (updated[key]?.some((t) => t.id === taskId)) {
            updated[key] = updated[key].filter((t) => t.id !== taskId);
            break;
          }
        }
        return updated;
      });
      toast("Task deleted", "success");
    } catch {
      toast("Failed to delete task", "error");
    }
  };

  const completeTask = async (taskId: string) => {
    // Remove from board immediately
    setBoard((prev) => {
      const updated = { ...prev };
      for (const key of STATUS_ORDER) {
        if (updated[key]?.some((t) => t.id === taskId)) {
          updated[key] = updated[key].filter((t) => t.id !== taskId);
          break;
        }
      }
      return updated;
    });
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
    } catch {
      toast("Failed to complete task", "error");
      loadBoard(activeRoleId);
    }
  };

  const activeRole = roles.find((r) => r.id === activeRoleId);

  // Get all tasks for mobile filtered view
  const allTasks = STATUS_ORDER.flatMap((s) => board[s] || []);
  const filteredTasks = mobileFilter === "all" ? allTasks : allTasks.filter((t) => t.status === mobileFilter);

  return (
    <AppShell>
      <div className="py-6">
        <h1 className="text-[32px] font-semibold text-[var(--text-primary)] mb-6">Board</h1>

        {/* Role tabs */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1 mb-8">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => { setActiveRoleId(role.id); setMobileFilter("all"); }}
              className={cn(
                "px-4 py-1.5 rounded-full text-[15px] font-medium whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5",
                activeRoleId === role.id
                  ? "text-white"
                  : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
              )}
              style={activeRoleId === role.id ? { backgroundColor: role.color } : undefined}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: activeRoleId === role.id ? "white" : role.color }}
              />
              {role.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-5 h-5 border-2 border-[var(--border-default)] border-t-[var(--accent-blue)] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Desktop: 5-column board (4 status + done) */}
            <div className="hidden md:grid grid-cols-5 gap-4">
              {STATUS_ORDER.map((status) => (
                <div
                  key={status}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverCol(status);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverCol(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverCol(null);
                    if (dragTaskId) {
                      const fromStatus = STATUS_ORDER.find((s) =>
                        board[s]?.some((t) => t.id === dragTaskId)
                      );
                      if (fromStatus && fromStatus !== status) {
                        changeStatus(dragTaskId, status);
                      }
                    }
                    setDragTaskId(null);
                  }}
                  className={cn(
                    "rounded-xl transition-colors min-h-[200px] p-2 -m-2",
                    dragOverCol === status && dragTaskId && "bg-[var(--surface-raised)]/50 ring-2 ring-inset ring-[var(--accent-blue)]/30"
                  )}
                >
                  <div
                    className="text-[13px] font-medium uppercase tracking-wider mb-3 pb-2 border-b border-[var(--border-subtle)]"
                    style={{ color: STATUS_CONFIG[status].text }}
                  >
                    {STATUS_CONFIG[status].label}
                    <span className="text-[var(--text-tertiary)] font-normal ml-2">
                      ({board[status]?.length || 0})
                    </span>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence mode="popLayout">
                      {board[status]?.map((task) => (
                        <BoardCard
                          key={task.id}
                          task={task}
                          status={status}
                          onStatusChange={changeStatus}
                          onComplete={completeTask}
                          onUpdate={updateTask}
                          onDelete={deleteTask}
                          isDragging={dragTaskId === task.id}
                          onDragStart={() => setDragTaskId(task.id)}
                          onDragEnd={() => { setDragTaskId(null); setDragOverCol(null); }}
                        />
                      ))}
                    </AnimatePresence>
                    {(!board[status] || board[status].length === 0) && (
                      <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">
                        {dragTaskId ? "Drop here" : "No tasks"}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {/* Done column — drop target only */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverCol("done");
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverCol(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverCol(null);
                  if (dragTaskId) {
                    completeTask(dragTaskId);
                  }
                  setDragTaskId(null);
                }}
                className={cn(
                  "rounded-xl transition-colors min-h-[200px] p-2 -m-2",
                  dragOverCol === "done" && dragTaskId && "ring-2 ring-inset ring-[#22c55e]/40"
                )}
                style={dragOverCol === "done" && dragTaskId ? { background: "rgba(34,197,94,0.06)" } : undefined}
              >
                <div
                  className="text-[13px] font-medium uppercase tracking-wider mb-3 pb-2 border-b border-[var(--border-subtle)]"
                  style={{ color: DONE_COL.text }}
                >
                  {DONE_COL.label}
                </div>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors",
                      dragTaskId ? "bg-[rgba(34,197,94,0.15)]" : "bg-[var(--surface-raised)]"
                    )}
                  >
                    <Check className={cn("h-5 w-5 transition-colors", dragTaskId ? "text-[#22c55e]" : "text-[var(--text-tertiary)]")} />
                  </div>
                  <p className="text-[13px] text-[var(--text-tertiary)]">
                    {dragTaskId ? "Drop to complete" : "Drag here to complete"}
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile: filtered list */}
            <div className="md:hidden">
              {/* Status filter pills */}
              <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1 mb-6">
                <button
                  onClick={() => setMobileFilter("all")}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-[15px] font-medium whitespace-nowrap transition-colors shrink-0",
                    mobileFilter === "all"
                      ? "bg-[var(--accent-blue)] text-white"
                      : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
                  )}
                >
                  All ({allTasks.length})
                </button>
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => setMobileFilter(s)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-[15px] font-medium whitespace-nowrap transition-colors shrink-0",
                      mobileFilter === s
                        ? "bg-[var(--accent-blue)] text-white"
                        : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
                    )}
                  >
                    {STATUS_CONFIG[s].label} ({board[s]?.length || 0})
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {filteredTasks.map((task) => (
                    <BoardCard
                      key={task.id}
                      task={task}
                      status={task.status}
                      onStatusChange={changeStatus}
                      onComplete={completeTask}
                      onUpdate={updateTask}
                      onDelete={deleteTask}
                    />
                  ))}
                </AnimatePresence>
                {filteredTasks.length === 0 && (
                  <p className="text-[var(--text-tertiary)] text-sm py-16 text-center">
                    No {mobileFilter === "all" ? "" : STATUS_CONFIG[mobileFilter]?.label + " "}tasks for {activeRole?.name}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function BoardCard({
  task,
  status,
  onStatusChange,
  onComplete,
  onUpdate,
  onDelete,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: BoardTask;
  status: string;
  onStatusChange: (id: string, status: string) => void;
  onComplete?: (id: string) => void;
  onUpdate?: (id: string, data: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editNotes, setEditNotes] = useState(task.notes || "");
  const [editDueDate, setEditDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>(
    Array.isArray(task.checklist) ? task.checklist : []
  );
  const [newCheckItem, setNewCheckItem] = useState("");
  const [editTags, setEditTags] = useState<string[]>(task.tags?.map((t) => t.tag.name) || []);
  const [newTag, setNewTag] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const borderColor = STATUS_CONFIG[status]?.text || "var(--border-subtle)";

  const save = (data: Record<string, unknown>) => onUpdate?.(task.id, data);

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCompleting(true);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    setTimeout(() => onComplete?.(task.id), 400);
  };

  return (
    <AnimatePresence>
      {!completing && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
          exit={{ opacity: 0, x: 60, scale: 0.95 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          draggable={!expanded}
          onDragStart={(e) => {
            if (expanded) return;
            const evt = e as unknown as React.DragEvent;
            evt.dataTransfer.effectAllowed = "move";
            onDragStart?.();
          }}
          onDragEnd={() => onDragEnd?.()}
          className={cn(
            "bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl",
            !expanded && "cursor-grab active:cursor-grabbing",
            isDragging && "ring-2 ring-[var(--accent-blue)]/40"
          )}
          style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
        >
          {/* Collapsed card */}
          <div className="p-3.5">
            <div className="flex items-start gap-2.5">
              <button
                onClick={handleComplete}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center cursor-pointer mt-0.5"
                aria-label="Complete task"
              >
                <span
                  className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors"
                  style={{ borderColor: `color-mix(in srgb, ${borderColor} 40%, transparent)` }}
                />
              </button>

              <button
                onClick={() => setExpanded(!expanded)}
                className="flex-1 min-w-0 text-left"
              >
                {task.priority === "urgent" && (
                  <span className="text-[11px] font-bold tracking-wide text-red-400 uppercase">URGENT</span>
                )}
                <p className="text-[15px] font-medium text-[var(--text-primary)] leading-snug">{task.title}</p>

                {!expanded && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextIdx = (STATUS_ORDER.indexOf(status) + 1) % STATUS_ORDER.length;
                        onStatusChange(task.id, STATUS_ORDER[nextIdx]);
                      }}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                      style={{
                        background: STATUS_CONFIG[status]?.bg,
                        color: STATUS_CONFIG[status]?.text,
                      }}
                    >
                      {STATUS_CONFIG[status]?.label}
                    </span>
                    {task.tags?.map((t) => (
                      <span
                        key={t.tag.id}
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          background: `${t.tag.color}20`,
                          color: t.tag.color,
                        }}
                      >
                        #{t.tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Expanded detail panel */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-3.5 pb-3.5 space-y-3 border-t border-[var(--border-subtle)] pt-3">
                  {/* Title */}
                  <input
                    ref={titleRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => { if (editTitle.trim() && editTitle !== task.title) save({ title: editTitle.trim() }); }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-full bg-transparent text-[14px] font-medium text-[var(--text-primary)] outline-none"
                  />

                  {/* Notes */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">Notes</p>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      onBlur={() => { if (editNotes !== (task.notes || "")) save({ notes: editNotes || null }); }}
                      placeholder="Add notes..."
                      className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 resize-none min-h-[50px] placeholder:text-[var(--text-tertiary)]"
                    />
                  </div>

                  {/* Due date */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">Due date</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => { setEditDueDate(e.target.value); save({ dueDate: e.target.value || null }); }}
                        className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20"
                      />
                      {editDueDate && (
                        <button onClick={() => { setEditDueDate(""); save({ dueDate: null }); }} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Clear</button>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">Status</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {STATUS_ORDER.map((s) => (
                        <button
                          key={s}
                          onClick={() => onStatusChange(task.id, s)}
                          className="text-[12px] font-medium px-2.5 py-0.5 rounded-full transition-all"
                          style={{
                            background: s === status ? (STATUS_CONFIG[s]?.bg) : "transparent",
                            color: s === status ? (STATUS_CONFIG[s]?.text) : "var(--text-tertiary)",
                            border: s === status ? "none" : "1px solid var(--border-subtle)",
                          }}
                        >
                          {STATUS_CONFIG[s]?.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">Tags</p>
                    <div className="flex gap-1.5 flex-wrap mb-1.5">
                      {editTags.map((tagName) => {
                        const tagData = task.tags?.find((t) => t.tag.name === tagName);
                        const color = tagData?.tag.color || "#888780";
                        return (
                          <span key={tagName} className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
                            #{tagName}
                            <button onClick={() => { const updated = editTags.filter((t) => t !== tagName); setEditTags(updated); save({ tags: updated }); }}>
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    <input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTag.trim()) {
                          const name = newTag.toLowerCase().trim();
                          if (!editTags.includes(name)) {
                            const updated = [...editTags, name];
                            setEditTags(updated);
                            save({ tags: updated });
                          }
                          setNewTag("");
                        }
                      }}
                      placeholder="Add tag..."
                      className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 placeholder:text-[var(--text-tertiary)]"
                    />
                  </div>

                  {/* Checklist */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                      Checklist {editChecklist.length > 0 && `(${editChecklist.filter((c) => c.done).length}/${editChecklist.length})`}
                    </p>
                    <div className="space-y-1">
                      {editChecklist.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 group">
                          <button onClick={() => { const updated = editChecklist.map((c, j) => j === i ? { ...c, done: !c.done } : c); setEditChecklist(updated); save({ checklist: updated }); }} className="w-4 h-4 rounded border border-[var(--border-default)] flex items-center justify-center shrink-0">
                            {item.done && <Check className="w-2.5 h-2.5 text-[var(--text-secondary)]" />}
                          </button>
                          <span className={`flex-1 text-[13px] ${item.done ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>{item.text}</span>
                          <button onClick={() => { const updated = editChecklist.filter((_, j) => j !== i); setEditChecklist(updated); save({ checklist: updated }); }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="h-3 w-3 text-[var(--text-tertiary)]" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Plus className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                      <input
                        value={newCheckItem}
                        onChange={(e) => setNewCheckItem(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && newCheckItem.trim()) { const updated = [...editChecklist, { text: newCheckItem.trim(), done: false }]; setEditChecklist(updated); setNewCheckItem(""); save({ checklist: updated }); } }}
                        placeholder="Add item..."
                        className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                      />
                    </div>
                  </div>

                  {/* Delete */}
                  <div className="pt-2 border-t border-[var(--border-subtle)]">
                    <button onClick={() => onDelete?.(task.id)} className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-red-400 transition-colors min-h-[44px]">
                      <Trash2 className="h-3.5 w-3.5" /> Delete task
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
