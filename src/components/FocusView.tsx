"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TaskItem } from "./TaskItem";
import { MorningPick } from "./MorningPick";
import { STATUS_CONFIG, STATUS_ORDER } from "./TaskItem";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Plus, Sparkles, Moon, Inbox, Users, MessageSquare, ChevronLeft, ChevronRight, List, Columns3, Check, X, Trash2, Clock, Mic, Key, Link2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

interface Task {
  id: string;
  title: string;
  priority: string;
  status: string;
  roleId: string;
  isToday: boolean;
  notes?: string | null;
  dueDate?: string | null;
  checklist?: Array<{ text: string; done: boolean }> | null;
  tags?: Array<{ tag: { id: string; name: string; color: string } }>;
  role: { id: string; name: string; color: string; priority: number };
}

interface Role {
  id: string;
  name: string;
  color: string;
  priority: number;
}

interface BlockInfo {
  id: string;
  label: string;
  timeLabel: string;
  roleId: string | null;
  roleName?: string;
  roleColor?: string;
  roleTitle?: string;
}

interface FocusViewProps {
  currentBlock: BlockInfo | null;
  nextBlocks?: BlockInfo[];
  allBlocks?: BlockInfo[];
  offClockMessage: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function FocusView({ currentBlock, nextBlocks, allBlocks = [], offClockMessage }: FocusViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showMorning, setShowMorning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [boardDragId, setBoardDragId] = useState<string | null>(null);
  const [boardDragOverCol, setBoardDragOverCol] = useState<string | null>(null);
  const [blockOverrideIdx, setBlockOverrideIdx] = useState<number | null>(null);
  const [onboarding, setOnboarding] = useState<Record<string, boolean> | null>(null);
  const [showChecklist, setShowChecklist] = useState(true);
  const { toast } = useToast();

  // Block navigation: override lets user cycle through all blocks
  const currentBlockIdx = allBlocks.findIndex((b) => b.id === currentBlock?.id);
  const activeIdx = blockOverrideIdx !== null ? blockOverrideIdx : currentBlockIdx;
  const activeBlock = activeIdx >= 0 ? allBlocks[activeIdx] : currentBlock;
  const isOverridden = blockOverrideIdx !== null && blockOverrideIdx !== currentBlockIdx;
  const canGoPrev = activeIdx > 0;
  const canGoNext = activeIdx < allBlocks.length - 1;

  const goToPrevBlock = () => {
    if (canGoPrev) setBlockOverrideIdx(activeIdx - 1);
  };
  const goToNextBlock = () => {
    if (canGoNext) setBlockOverrideIdx(activeIdx + 1);
  };
  const resetToCurrentBlock = () => setBlockOverrideIdx(null);

  const fetchTasks = useCallback(async () => {
    try {
      const [todayRes, allRes, rolesRes] = await Promise.all([
        fetch("/api/tasks?today=true"),
        fetch("/api/tasks"),
        fetch("/api/roles"),
      ]);
      const todayData = await todayRes.json();
      const allData = await allRes.json();
      const rolesData = await rolesRes.json();

      setTasks(Array.isArray(todayData) ? todayData : []);
      setAllTasks(Array.isArray(allData) ? allData : []);
      setRoles(Array.isArray(rolesData) ? rolesData : []);

      if (Array.isArray(todayData) && todayData.length === 0 && Array.isArray(allData) && allData.length > 0) {
        setShowMorning(true);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("conductor-checklist-dismissed") === "true") {
      setShowChecklist(false);
    }
    fetch("/api/onboarding").then((r) => r.json()).then(setOnboarding).catch(() => {});
  }, [allTasks.length]);

  const completeTask = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast("Failed to complete task", "error");
    }
  };

  const updateTask = async (id: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...data } as Task : t));
      setAllTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...data } as Task : t));
    } catch {
      toast("Failed to update task", "error");
    }
  };

  const changeStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    } catch {
      toast("Failed to update status", "error");
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast("Task deleted", "success");
    } catch {
      toast("Failed to delete task", "error");
    }
  };

  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    setTasks((prev) => {
      const items = [...prev];
      const fromIdx = items.findIndex((t) => t.id === dragId);
      const toIdx = items.findIndex((t) => t.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, moved);
      return items;
    });
  };
  const handleDragEnd = () => {
    setDragId(null);
    const roleId = currentBlock?.roleId;
    const roleTasks = roleId ? tasks.filter((t) => t.roleId === roleId) : tasks;
    fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: roleTasks.map((t) => t.id) }),
    }).catch(() => {});
  };

  const handleMorningConfirm = async (ids: string[]) => {
    await fetch("/api/tasks/select-today", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds: ids }),
    });
    setShowMorning(false);
    fetchTasks();
  };

  const addTask = async () => {
    if (!newTaskTitle.trim() || !activeBlock?.roleId) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: activeBlock.roleId, title: newTaskTitle, isToday: true }),
      });
      if (!res.ok) throw new Error();
      toast("Task added", "success");
    } catch {
      toast("Failed to add task", "error");
    }
    setNewTaskTitle("");
    setShowAdd(false);
    fetchTasks();
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="w-5 h-5 border-2 border-[var(--border-default)] border-t-[var(--accent-blue)] rounded-full animate-spin" />
      </div>
    );
  }

  if (showMorning) {
    const tasksByRole = roles
      .filter((r) => allTasks.some((t) => t.roleId === r.id))
      .map((role) => ({
        role,
        tasks: allTasks.filter((t) => t.roleId === role.id),
      }));

    return (
      <MorningPick
        tasksByRole={tasksByRole}
        onConfirm={handleMorningConfirm}
        onSkip={() => setShowMorning(false)}
      />
    );
  }

  // First-run welcome / onboarding checklist
  const dismissChecklist = () => {
    setShowChecklist(false);
    localStorage.setItem("conductor-checklist-dismissed", "true");
  };

  const checklistItems: Array<{ key: string; label: string; description: string; icon: React.ElementType; href: string }> = [
    { key: "tasks", label: "Add your first tasks", description: "Paste a transcript or add tasks manually", icon: Inbox, href: "/inbox" },
    { key: "schedule", label: "Configure your schedule", description: "Assign companies to time blocks", icon: Clock, href: "/settings?tab=system&sub=general" },
    { key: "staff", label: "Set up your team", description: "Add staff to each role for smart drafting", icon: Users, href: "/settings?tab=roles" },
    { key: "voiceProfile", label: "Set your voice profile", description: "Help AI match your communication style", icon: Mic, href: "/settings?tab=profile" },
    { key: "apiKey", label: "Add an API key", description: "Required for AI chat, drafts, and extraction", icon: Key, href: "/settings?tab=system&sub=apikeys" },
    { key: "integrations", label: "Connect integrations", description: "Linear for tasks, Granola for meeting transcripts", icon: Link2, href: "/settings?tab=integrations" },
    { key: "ai", label: "Talk to AI", description: "Ask questions about your schedule or draft messages", icon: MessageSquare, href: "/ai" },
  ];

  if (allTasks.length === 0 || (onboarding && showChecklist && Object.values(onboarding).some((v) => !v))) {
    const completedCount = onboarding ? Object.values(onboarding).filter(Boolean).length : 0;
    const totalCount = checklistItems.length;
    const allDone = completedCount === totalCount;

    if (allTasks.length === 0 || showChecklist) {
      return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="py-12">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[var(--surface-raised)] flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-[var(--text-tertiary)]" />
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-semibold text-[var(--text-primary)]">
              {allTasks.length === 0 ? "Welcome to Conductor" : "Getting set up"}
            </h1>
            <p className="text-[15px] text-[var(--text-secondary)] mt-1.5">
              {allDone ? "You're all set! Dismiss this checklist to get started." : `${completedCount} of ${totalCount} complete — finish setting up your workspace.`}
            </p>
            {/* Progress bar */}
            {onboarding && (
              <div className="flex gap-1.5 mt-4 max-w-[320px] mx-auto">
                {checklistItems.map((item) => (
                  <div
                    key={item.key}
                    className="flex-1 h-1 rounded-full transition-colors"
                    style={{ backgroundColor: onboarding[item.key] ? "var(--accent-blue)" : "var(--border-subtle)" }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {checklistItems.map((item) => {
              const done = onboarding?.[item.key] ?? false;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-4 border rounded-xl p-4 transition-colors ${
                    done
                      ? "border-[var(--border-subtle)]/50 opacity-60"
                      : "border-[var(--border-subtle)] hover:bg-[var(--sidebar-hover)]"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                  ) : (
                    <item.icon className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[16px] font-medium ${done ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"}`}>{item.label}</p>
                    <p className="text-[14px] text-[var(--text-tertiary)] mt-0.5">{item.description}</p>
                  </div>
                  {!done && <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />}
                </Link>
              );
            })}
          </div>
          <div className="text-center mt-6">
            <button
              onClick={dismissChecklist}
              className="text-[14px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              {allDone ? "Dismiss" : "Skip for now"}
            </button>
          </div>
        </motion.div>
      );
    }
  }

  // Off the clock — show all today's tasks with a subtle indicator

  const currentRoleTasks = activeBlock?.roleId
    ? tasks.filter((t) => t.roleId === activeBlock.roleId)
    : tasks;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {activeBlock && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-[15px] text-[var(--text-tertiary)]">{activeBlock.timeLabel}</p>
            {isOverridden && (
              <button
                onClick={resetToCurrentBlock}
                className="text-[12px] text-[var(--accent-blue)] hover:underline"
              >
                Back to now
              </button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {allBlocks.length > 1 && (
                <button
                  onClick={goToPrevBlock}
                  disabled={!canGoPrev}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-20 disabled:cursor-default"
                  aria-label="Previous block"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <h1 className="text-[44px] font-bold leading-tight" style={{ color: activeBlock.roleColor || "#e8e6e1" }}>
                {activeBlock.roleName || "Triage"}
              </h1>
              {!isOverridden && (
                <span className="w-2 h-2 rounded-full animate-pulse shrink-0 mt-1" style={{ backgroundColor: activeBlock.roleColor || "#706c65" }} />
              )}
              {allBlocks.length > 1 && (
                <button
                  onClick={goToNextBlock}
                  disabled={!canGoNext}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-20 disabled:cursor-default"
                  aria-label="Next block"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
            {/* View toggle */}
            <div className="flex items-center bg-[var(--surface-raised)] rounded-lg border border-[var(--border-subtle)] p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-md transition-colors ${viewMode === "list" ? "bg-[var(--sidebar-active)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("board")}
                className={`p-2 rounded-md transition-colors ${viewMode === "board" ? "bg-[var(--sidebar-active)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
                aria-label="Board view"
              >
                <Columns3 className="h-4 w-4" />
              </button>
            </div>
          </div>
          {activeBlock.roleTitle && (
            <p className="text-[17px] text-[var(--text-secondary)] mt-0.5">{activeBlock.roleTitle}</p>
          )}
          {viewMode === "board" && (
            <p className="text-[13px] text-[var(--text-tertiary)] mt-2">Today&apos;s tasks by status</p>
          )}
        </section>
      )}

      {!activeBlock && offClockMessage && (
        <section className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] text-[var(--text-tertiary)] mb-1.5">{offClockMessage}</p>
              <h1 className="text-[36px] font-bold text-[var(--text-secondary)] leading-tight">
                Today&apos;s tasks
              </h1>
            </div>
            {/* View toggle */}
            <div className="flex items-center bg-[var(--surface-raised)] rounded-lg border border-[var(--border-subtle)] p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-md transition-colors ${viewMode === "list" ? "bg-[var(--sidebar-active)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("board")}
                className={`p-2 rounded-md transition-colors ${viewMode === "board" ? "bg-[var(--sidebar-active)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
                aria-label="Board view"
              >
                <Columns3 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <>
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {currentRoleTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => handleDragStart(task.id)}
                  onDragOver={(e) => handleDragOver(e, task.id)}
                  onDragEnd={handleDragEnd}
                  className={dragId === task.id ? "opacity-50" : ""}
                >
                  <TaskItem id={task.id} title={task.title} priority={task.priority} status={task.status} roleColor={task.role.color} roleName={!activeBlock?.roleId ? task.role.name : undefined} notes={task.notes} dueDate={task.dueDate} checklist={task.checklist} tags={task.tags} onComplete={completeTask} onUpdate={updateTask} onDelete={deleteTask} onStatusChange={changeStatus} />
                </div>
              ))}
            </AnimatePresence>
          </div>

          {currentRoleTasks.length === 0 && activeBlock && (
            <div className="py-16 text-center">
              <Sparkles className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
              <p className="text-[22px] font-semibold text-[var(--text-primary)]">All clear</p>
              <p className="text-[16px] text-[var(--text-tertiary)] mt-1">Nothing on deck for this block</p>
              <div className="flex items-center justify-center gap-4 mt-4">
                <button onClick={() => setShowAdd(true)} className="text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
                  Pull from backlog &rarr;
                </button>
                {canGoNext && (
                  <button
                    onClick={goToNextBlock}
                    className="text-[15px] text-[var(--accent-blue)] hover:underline transition-colors"
                  >
                    Next role &rarr;
                  </button>
                )}
              </div>
            </div>
          )}

          {activeBlock?.roleId && currentRoleTasks.length > 0 && (
            <div className="mt-6">
              {showAdd ? (
                <div className="flex gap-2">
                  <input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Task title..."
                    className="flex-1 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                    onKeyDown={(e) => e.key === "Enter" && addTask()}
                    autoFocus
                  />
                  <Button onClick={addTask} size="sm">Add</Button>
                  <Button onClick={() => setShowAdd(false)} size="sm" variant="ghost">Cancel</Button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center justify-center gap-2 py-3 text-[16px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors rounded-2xl border border-dashed border-[var(--border-default)] hover:border-[var(--text-tertiary)] w-full"
                >
                  <Plus className="h-4 w-4" /> Add task
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Board view */}
      {viewMode === "board" && (
        <FocusBoard
          tasks={currentRoleTasks}
          roleColor={activeBlock?.roleColor || "#706c65"}
          onStatusChange={changeStatus}
          onComplete={completeTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
          dragId={boardDragId}
          setDragId={setBoardDragId}
          dragOverCol={boardDragOverCol}
          setDragOverCol={setBoardDragOverCol}
        />
      )}

    </motion.div>
  );
}

/* ── Inline board view for Focus mode ── */

import { cn } from "@/lib/utils";

function FocusBoard({
  tasks,
  roleColor,
  onStatusChange,
  onComplete,
  onUpdate,
  onDelete,
  dragId,
  setDragId,
  dragOverCol,
  setDragOverCol,
}: {
  tasks: Task[];
  roleColor: string;
  onStatusChange: (id: string, status: string) => void;
  onComplete: (id: string) => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  dragOverCol: string | null;
  setDragOverCol: (col: string | null) => void;
}) {
  const grouped: Record<string, Task[]> = {};
  for (const s of STATUS_ORDER) {
    grouped[s] = tasks.filter((t) => t.status === s);
  }

  // Mobile: status filter
  const [mobileFilter, setMobileFilter] = useState<string>("all");
  const filteredTasks = mobileFilter === "all" ? tasks : tasks.filter((t) => t.status === mobileFilter);

  return (
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
              if (dragId) {
                const fromStatus = tasks.find((t) => t.id === dragId)?.status;
                if (fromStatus && fromStatus !== status) {
                  onStatusChange(dragId, status);
                }
              }
              setDragId(null);
            }}
            className={cn(
              "rounded-xl transition-colors min-h-[200px] p-2 -m-2",
              dragOverCol === status && dragId && "bg-[var(--surface-raised)]/50 ring-2 ring-inset ring-[var(--accent-blue)]/30"
            )}
          >
            <div
              className="text-[13px] font-medium uppercase tracking-wider mb-3 pb-2 border-b border-[var(--border-subtle)]"
              style={{ color: STATUS_CONFIG[status].text }}
            >
              {STATUS_CONFIG[status].label}
              <span className="text-[var(--text-tertiary)] font-normal ml-2">
                ({grouped[status].length})
              </span>
            </div>
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {grouped[status].map((task) => (
                  <FocusBoardCard
                    key={task.id}
                    task={task}
                    status={status}
                    roleColor={roleColor}
                    isDragging={dragId === task.id}
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                    onStatusChange={onStatusChange}
                    onComplete={onComplete}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}
              </AnimatePresence>
              {grouped[status].length === 0 && (
                <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">
                  {dragId ? "Drop here" : "No tasks"}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Done column */}
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
            if (dragId) onComplete(dragId);
            setDragId(null);
          }}
          className={cn(
            "rounded-xl transition-colors min-h-[200px] p-2 -m-2",
            dragOverCol === "done" && dragId && "ring-2 ring-inset ring-[#22c55e]/40"
          )}
          style={dragOverCol === "done" && dragId ? { background: "rgba(34,197,94,0.06)" } : undefined}
        >
          <div
            className="text-[13px] font-medium uppercase tracking-wider mb-3 pb-2 border-b border-[var(--border-subtle)]"
            style={{ color: "#22c55e" }}
          >
            done
          </div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors",
                dragId ? "bg-[rgba(34,197,94,0.15)]" : "bg-[var(--surface-raised)]"
              )}
            >
              <Check className={cn("h-5 w-5 transition-colors", dragId ? "text-[#22c55e]" : "text-[var(--text-tertiary)]")} />
            </div>
            <p className="text-[13px] text-[var(--text-tertiary)]">
              {dragId ? "Drop to complete" : "Drag here to complete"}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile: filtered list */}
      <div className="md:hidden">
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
            All ({tasks.length})
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
              {STATUS_CONFIG[s].label} ({grouped[s].length})
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <FocusBoardCard
              key={task.id}
              task={task}
              status={task.status}
              roleColor={roleColor}
              onStatusChange={onStatusChange}
              onComplete={onComplete}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
          {filteredTasks.length === 0 && (
            <p className="text-[var(--text-tertiary)] text-sm py-16 text-center">No tasks</p>
          )}
        </div>
      </div>
    </>
  );
}

function FocusBoardCard({
  task,
  status,
  roleColor,
  isDragging,
  onDragStart,
  onDragEnd,
  onStatusChange,
  onComplete,
  onUpdate,
  onDelete,
}: {
  task: Task;
  status: string;
  roleColor: string;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onStatusChange: (id: string, status: string) => void;
  onComplete: (id: string) => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editNotes, setEditNotes] = useState(task.notes || "");
  const [editDueDate, setEditDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [editChecklist, setEditChecklist] = useState<Array<{ text: string; done: boolean }>>(
    Array.isArray(task.checklist) ? task.checklist : []
  );
  const [newCheckItem, setNewCheckItem] = useState("");
  const [editTags, setEditTags] = useState<string[]>(task.tags?.map((t) => t.tag.name) || []);
  const [newTag, setNewTag] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const borderColor = STATUS_CONFIG[status]?.text || "var(--border-subtle)";

  const save = (data: Record<string, unknown>) => onUpdate(task.id, data);

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCompleting(true);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    setTimeout(() => onComplete(task.id), 400);
  };

  return (
    <AnimatePresence>
      {!completing && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          draggable={!!onDragStart && !expanded}
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
          <div className="p-3.5">
            <div className="flex items-start gap-3">
              <button
                onClick={handleComplete}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center cursor-pointer mt-0.5"
                aria-label="Complete task"
              >
                <span
                  className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors"
                  style={{ borderColor: `color-mix(in srgb, ${roleColor} 40%, transparent)` }}
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
                        style={{ background: `${t.tag.color}20`, color: t.tag.color }}
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
                  <input
                    ref={titleRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => { if (editTitle.trim() && editTitle !== task.title) save({ title: editTitle.trim() }); }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-full bg-transparent text-[14px] font-medium text-[var(--text-primary)] outline-none"
                  />

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

                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">Status</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {STATUS_ORDER.map((s) => (
                        <button
                          key={s}
                          onClick={() => onStatusChange(task.id, s)}
                          className="text-[12px] font-medium px-2.5 py-0.5 rounded-full transition-all"
                          style={{
                            background: s === status ? STATUS_CONFIG[s]?.bg : "transparent",
                            color: s === status ? STATUS_CONFIG[s]?.text : "var(--text-tertiary)",
                            border: s === status ? "none" : "1px solid var(--border-subtle)",
                          }}
                        >
                          {STATUS_CONFIG[s]?.label}
                        </button>
                      ))}
                    </div>
                  </div>

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

                  <div className="pt-2 border-t border-[var(--border-subtle)]">
                    <button onClick={() => onDelete(task.id)} className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-red-400 transition-colors min-h-[44px]">
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
