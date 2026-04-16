"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Eye, EyeOff } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TaskDetailDrawer } from "@/components/TaskDetailDrawer";
import { STATUS_CONFIG, STATUS_ORDER, BOARD_COLUMNS } from "@/components/TaskItem";
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
  isToday?: boolean;
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
  const searchParams = useSearchParams();
  const initialRoleId = searchParams.get("roleId") || "";
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRoleId, setActiveRoleId] = useState(initialRoleId);
  const [board, setBoard] = useState<BoardData>({});
  const [loading, setLoading] = useState(true);
  const [mobileFilter, setMobileFilter] = useState<string>("all");
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setRoles(arr);
        if (!activeRoleId && arr.length > 0) setActiveRoleId(arr[0].id);
      })
      .catch(() => {});
  }, []);

  const loadBoard = useCallback(async (roleId: string, withDone: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/board?roleId=${roleId}${withDone ? "&includeDone=1" : ""}`);
      const data = await res.json();
      setBoard(data);
    } catch {
      toast("Failed to load board", "error");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (activeRoleId) loadBoard(activeRoleId, showDone);
  }, [activeRoleId, showDone, loadBoard]);

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
      const result = await res.json();
      setBoard((prev) => {
        const updated = { ...prev };
        for (const key of STATUS_ORDER) {
          if (updated[key]) {
            updated[key] = updated[key].map((t) =>
              t.id === taskId ? { ...t, ...result } as BoardTask : t
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
      loadBoard(activeRoleId, showDone);
    }
  };

  const activeRole = roles.find((r) => r.id === activeRoleId);
  const drawerTask = drawerTaskId ? [...STATUS_ORDER, "done"].flatMap((s) => board[s] || []).find((t) => t.id === drawerTaskId) || null : null;

  // Get all tasks for mobile filtered view
  const allTasks = BOARD_COLUMNS.flatMap((s) => board[s] || []);
  const filteredTasks = mobileFilter === "all" ? allTasks : allTasks.filter((t) => t.status === mobileFilter);

  return (
    <AppShell>
      <div className="py-6">
        <h1 className="text-[32px] font-semibold text-[var(--text-primary)] mb-1">Board</h1>
        <p className="text-[15px] text-[var(--text-tertiary)] mb-6">Kanban view of all tasks by status. Drag to reorder, filter by role.</p>

        {/* Role tabs + done toggle */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1 flex-1">
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
          <button
            onClick={() => setShowDone(!showDone)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors shrink-0",
              showDone
                ? "bg-[#22c55e]/15 text-[#22c55e]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
            )}
          >
            {showDone ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showDone ? "Hide done" : "Show done"}
          </button>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-5 h-5 border-2 border-[var(--border-default)] border-t-[var(--accent-blue)] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Desktop: horizontal scrolling kanban lanes */}
            <div className="hidden md:flex gap-4 overflow-x-auto hide-scrollbar pb-4" style={{ minHeight: "calc(100vh - 260px)" }}>
              {BOARD_COLUMNS.map((status) => (
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
                    "rounded-xl transition-colors flex-shrink-0 w-[280px] p-3 flex flex-col",
                    "bg-[var(--surface-sunken)]/30 border border-[var(--border-subtle)]",
                    dragOverCol === status && dragTaskId && "bg-[var(--surface-raised)]/50 ring-2 ring-inset ring-[var(--accent-blue)]/30"
                  )}
                >
                  <div
                    className="text-[13px] font-medium uppercase tracking-wider mb-3 pb-2 border-b border-[var(--border-subtle)] shrink-0"
                    style={{ color: STATUS_CONFIG[status].text }}
                  >
                    {STATUS_CONFIG[status].label}
                    <span className="text-[var(--text-tertiary)] font-normal ml-2">
                      ({board[status]?.length || 0})
                    </span>
                  </div>
                  <div className="space-y-2 flex-1 overflow-y-auto hide-scrollbar">
                    <AnimatePresence mode="popLayout">
                      {board[status]?.map((task) => (
                        <BoardCard
                          key={task.id}
                          task={task}
                          status={status}
                          onClick={() => setDrawerTaskId(task.id)}
                          onComplete={completeTask}
                          isDragging={dragTaskId === task.id}
                          onDragStart={() => setDragTaskId(task.id)}
                          onDragEnd={() => { setDragTaskId(null); setDragOverCol(null); }}
                        />
                      ))}
                    </AnimatePresence>
                    {(!board[status] || board[status].length === 0) && (
                      <p className="text-[13px] text-[var(--text-tertiary)] py-8 text-center">
                        {dragTaskId ? "Drop here" : "No tasks"}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {/* Done column — drop target + completed tasks list */}
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
                  "rounded-xl transition-colors flex-shrink-0 w-[280px] p-3 flex flex-col",
                  "bg-[var(--surface-sunken)]/30 border border-[var(--border-subtle)]",
                  dragOverCol === "done" && dragTaskId && "ring-2 ring-inset ring-[#22c55e]/40"
                )}
                style={dragOverCol === "done" && dragTaskId ? { background: "rgba(34,197,94,0.06)" } : undefined}
              >
                <div
                  className="text-[13px] font-medium uppercase tracking-wider mb-3 pb-2 border-b border-[var(--border-subtle)] shrink-0"
                  style={{ color: DONE_COL.text }}
                >
                  {DONE_COL.label}
                  {showDone && board.done && (
                    <span className="text-[var(--text-tertiary)] font-normal ml-2">
                      ({board.done.length})
                    </span>
                  )}
                </div>
                {showDone && board.done && board.done.length > 0 ? (
                  <div className="space-y-2 flex-1 overflow-y-auto hide-scrollbar">
                    {board.done.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => setDrawerTaskId(task.id)}
                        className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl cursor-pointer hover:bg-[var(--sidebar-hover)] transition-colors opacity-50 hover:opacity-70"
                        style={{ borderLeftWidth: 3, borderLeftColor: "#22c55e" }}
                      >
                        <div className="p-3.5">
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center mt-0.5">
                              <span className="w-5 h-5 rounded-md bg-[#22c55e]/20 border-2 border-[#22c55e]/50 flex items-center justify-center">
                                <Check className="h-3 w-3 text-[#22c55e]" />
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[15px] font-medium text-[var(--text-secondary)] leading-snug line-through decoration-[var(--text-tertiary)]">{task.title}</p>
                              {task.tags && task.tags.length > 0 && (
                                <div className="flex gap-1.5 flex-wrap mt-2">
                                  {task.tags.map((t) => (
                                    <span
                                      key={t.tag.id}
                                      className="text-[11px] px-2 py-0.5 rounded-full"
                                      style={{ background: `${t.tag.color}20`, color: t.tag.color }}
                                    >
                                      #{t.tag.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center flex-1">
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
                )}
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
                {BOARD_COLUMNS.map((s) => (
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
                      onClick={() => setDrawerTaskId(task.id)}
                      onComplete={completeTask}
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
      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setDrawerTaskId(null)}
        onUpdate={updateTask}
        onStatusChange={changeStatus}
        onComplete={completeTask}
        onDelete={deleteTask}
      />
    </AppShell>
  );
}

function BoardCard({
  task,
  status,
  onClick,
  onComplete,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: BoardTask;
  status: string;
  onClick: () => void;
  onComplete?: (id: string) => void;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const borderColor = STATUS_CONFIG[status]?.text || "var(--border-subtle)";

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
          draggable
          onDragStart={(e) => {
            const evt = e as unknown as React.DragEvent;
            evt.dataTransfer.effectAllowed = "move";
            onDragStart?.();
          }}
          onDragEnd={() => onDragEnd?.()}
          onClick={onClick}
          className={cn(
            "bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl cursor-pointer hover:bg-[var(--sidebar-hover)] transition-colors",
            isDragging && "ring-2 ring-[var(--accent-blue)]/40"
          )}
          style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
        >
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
              <div className="flex-1 min-w-0">
                {task.priority === "urgent" && (
                  <span className="text-[11px] font-bold tracking-wide text-red-400 uppercase">URGENT</span>
                )}
                <p className="text-[15px] font-medium text-[var(--text-primary)] leading-snug">{task.title}</p>
                <div className="flex gap-1.5 flex-wrap mt-2">
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full"
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
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
