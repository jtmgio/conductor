"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TaskItem } from "./TaskItem";
import { MorningPick } from "./MorningPick";
import { STATUS_CONFIG, STATUS_ORDER, BOARD_COLUMNS } from "./TaskItem";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Plus, Sparkles, Moon, Inbox, Users, MessageSquare, ChevronLeft, ChevronRight, List, Columns3, Check, X, Trash2, Clock, Mic, Key, Link2, CheckCircle2, Wand2, AlertTriangle, Copy, FileEdit, HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useHotkeys, type Shortcut } from "@/hooks/useHotkeys";
import { MorningBriefing } from "./MorningBriefing";
import { AgendaStrip } from "./AgendaStrip";
import { RoleHandoff } from "./RoleHandoff";
import Link from "next/link";

interface Task {
  id: string;
  title: string;
  priority: string;
  status: string;
  roleId: string;
  isToday: boolean;
  done: boolean;
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
  const [backlogTasks, setBacklogTasks] = useState<Task[]>([]);
  const [backlogLoading, setBacklogLoading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "board">("board");
  const [boardDragId, setBoardDragId] = useState<string | null>(null);
  const [boardDragOverCol, setBoardDragOverCol] = useState<string | null>(null);
  const [blockOverrideIdx, setBlockOverrideIdx] = useState<number | null>(null);
  const [onboarding, setOnboarding] = useState<Record<string, boolean> | null>(null);
  const [showChecklist, setShowChecklist] = useState(true);
  const [suggestion, setSuggestion] = useState<{
    taskId: string;
    taskTitle: string;
    loading: boolean;
    data: Record<string, unknown> | null;
  } | null>(null);
  const [agendaCollapsed, setAgendaCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("conductor-agenda-collapsed") === "true";
    }
    return false;
  });
  const { toast } = useToast();

  const toggleAgenda = () => {
    setAgendaCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("conductor-agenda-collapsed", String(next));
      return next;
    });
  };

  // ── Role transition detection ──
  const [transitionRole, setTransitionRole] = useState<{
    roleId: string;
    roleName: string;
    roleColor: string;
    roleTitle: string | null;
  } | null>(null);
  const [pauseUntil, setPauseUntil] = useState<number>(0);
  const prevRoleIdRef = useRef<string | null>(null);

  useEffect(() => {
    const newRoleId = currentBlock?.roleId || null;

    // Skip initial load
    if (prevRoleIdRef.current === null) {
      prevRoleIdRef.current = newRoleId;
      return;
    }

    // Skip if role hasn't changed
    if (newRoleId === prevRoleIdRef.current) return;

    // Skip if going to null (off-clock)
    if (!newRoleId || !currentBlock) {
      prevRoleIdRef.current = newRoleId;
      return;
    }

    // Skip if user has manually overridden block
    if (blockOverrideIdx !== null) {
      prevRoleIdRef.current = newRoleId;
      return;
    }

    // Skip if within pause period
    if (Date.now() < pauseUntil) {
      prevRoleIdRef.current = newRoleId;
      return;
    }

    prevRoleIdRef.current = newRoleId;

    // Show transition dialog
    setTransitionRole({
      roleId: newRoleId,
      roleName: currentBlock.roleName || "Unknown",
      roleColor: currentBlock.roleColor || "#706c65",
      roleTitle: currentBlock.roleTitle || null,
    });

    // Clear any manual block override so we snap to the new block
    setBlockOverrideIdx(null);
  }, [currentBlock?.roleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-trigger after pause expires
  useEffect(() => {
    if (pauseUntil <= 0) return;
    const remaining = pauseUntil - Date.now();
    if (remaining <= 0) return;

    const timer = setTimeout(() => {
      // After pause, show dialog for current role if it differs from what was showing before
      if (currentBlock?.roleId) {
        setTransitionRole({
          roleId: currentBlock.roleId,
          roleName: currentBlock.roleName || "Unknown",
          roleColor: currentBlock.roleColor || "#706c65",
          roleTitle: currentBlock.roleTitle || null,
        });
      }
      setPauseUntil(0);
    }, remaining);

    return () => clearTimeout(timer);
  }, [pauseUntil, currentBlock]);

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

  // Focus-specific keyboard shortcuts
  const focusShortcuts: Shortcut[] = useMemo(() => [
    { key: "[", action: goToPrevBlock, description: "Previous time block", category: "Focus" },
    { key: "]", action: goToNextBlock, description: "Next time block", category: "Focus" },
    { key: "l", modifiers: ["cmd"], action: () => setViewMode((v) => v === "list" ? "board" : "list"), description: "Toggle list/board", category: "Focus" },
  ], [activeIdx, allBlocks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useHotkeys(focusShortcuts);

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
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updated } as Task : t));
      setAllTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updated } as Task : t));
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
    const taskTitle = newTaskTitle.trim();
    const roleId = activeBlock.roleId;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, title: taskTitle, isToday: true }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      toast("Task added", "success");
      setNewTaskTitle("");
      fetchTasks();

      // Fire AI suggestion in background
      setSuggestion({ taskId: created.id, taskTitle, loading: true, data: null });
      fetch("/api/tasks/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle, roleId }),
      })
        .then((r) => r.json())
        .then((d) => {
          const s = d.suggestions || {};
          if (Object.keys(s).length === 0) {
            setSuggestion(null);
          } else {
            setSuggestion({ taskId: created.id, taskTitle, loading: false, data: s });
          }
        })
        .catch(() => setSuggestion(null));
    } catch {
      toast("Failed to add task", "error");
      setNewTaskTitle("");
    }
  };

  const loadBacklog = async (roleId: string) => {
    setBacklogLoading(true);
    try {
      const res = await fetch(`/api/tasks?roleId=${roleId}&backlog=true`);
      if (res.ok) {
        const data = await res.json();
        setBacklogTasks(Array.isArray(data) ? data.filter((t: Task) => !t.isToday && !t.done) : []);
      }
    } catch {}
    setBacklogLoading(false);
  };

  const pullToToday = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isToday: true }),
      });
      setBacklogTasks((prev) => prev.filter((t) => t.id !== taskId));
      fetchTasks();
    } catch {
      toast("Failed to add task", "error");
    }
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
        roles={roles}
        onConfirm={handleMorningConfirm}
        onSkip={() => setShowMorning(false)}
        onRefresh={fetchTasks}
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

  const mainContent = (
    <>
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
              <h1 className="text-[32px] md:text-[44px] font-bold leading-tight" style={{ color: activeBlock.roleColor || "#e8e6e1" }}>
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
              <h1 className="text-[28px] md:text-[36px] font-bold text-[var(--text-secondary)] leading-tight">
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
                <button onClick={() => { setShowAdd(true); if (activeBlock?.roleId) loadBacklog(activeBlock.roleId); }} className="text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
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

          {activeBlock?.roleId && (currentRoleTasks.length > 0 || showAdd) && (
            <div className="mt-6">
              {showAdd ? (
                <div className="space-y-3">
                  {/* Backlog tasks */}
                  {backlogLoading ? (
                    <div className="py-4 flex justify-center">
                      <div className="w-4 h-4 border-2 border-[var(--border-default)] border-t-[var(--accent-blue)] rounded-full animate-spin" />
                    </div>
                  ) : backlogTasks.length > 0 ? (
                    <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-[var(--surface-sunken)]/30 border-b border-[var(--border-subtle)]">
                        <p className="text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Backlog ({backlogTasks.length})</p>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto">
                        {backlogTasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => pullToToday(task.id)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--sidebar-hover)] transition-colors text-left border-b border-[var(--border-subtle)] last:border-b-0"
                          >
                            <Plus className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                            <span className="text-[14px] text-[var(--text-primary)] flex-1 truncate">{task.title}</span>
                            {task.priority === "urgent" && <span className="text-[11px] font-bold text-red-400 uppercase shrink-0">URGENT</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px] text-[var(--text-tertiary)] text-center py-3">No backlog tasks for this role</p>
                  )}

                  {/* New task input */}
                  <div className="flex gap-2">
                    <input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Or create a new task..."
                      className="flex-1 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 outline-none transition-all placeholder:text-[var(--text-tertiary)]"
                      onKeyDown={(e) => e.key === "Enter" && addTask()}
                    />
                    <Button onClick={addTask} size="sm">Add</Button>
                    <Button onClick={() => { setShowAdd(false); setBacklogTasks([]); setSuggestion(null); }} size="sm" variant="ghost">Done</Button>
                  </div>

                  {/* AI suggestion bar */}
                  <AnimatePresence>
                    {suggestion && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border border-[var(--border-subtle)] rounded-xl bg-[var(--surface-raised)] p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <Wand2 className="h-3.5 w-3.5 text-[var(--accent-blue)]" />
                              <span className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">AI Review</span>
                            </div>
                            <button onClick={() => setSuggestion(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {suggestion.loading ? (
                            <div className="flex items-center gap-2 py-1">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" />
                              <span className="text-[13px] text-[var(--text-tertiary)]">Reviewing &ldquo;{suggestion.taskTitle}&rdquo;...</span>
                            </div>
                          ) : suggestion.data && (
                            <div className="space-y-2">
                              {/* Duplicate warning */}
                              {!!suggestion.data.duplicate && (
                                <div className="flex items-start gap-2">
                                  <Copy className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                                  <p className="text-[13px] text-[var(--text-secondary)]">
                                    Similar to: <span className="text-[var(--text-primary)] font-medium">{String(suggestion.data.duplicate)}</span>
                                  </p>
                                </div>
                              )}

                              {/* Rewrite suggestion */}
                              {!!suggestion.data.rewrite && (
                                <div className="flex items-start gap-2">
                                  <FileEdit className="h-3.5 w-3.5 text-[var(--accent-blue)] mt-0.5 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] text-[var(--text-secondary)]">{String(suggestion.data.rewrite)}</p>
                                    <button
                                      onClick={() => {
                                        updateTask(suggestion.taskId, { title: suggestion.data!.rewrite });
                                        setSuggestion(null);
                                        toast("Title updated", "success");
                                        fetchTasks();
                                      }}
                                      className="text-[12px] text-[var(--accent-blue)] hover:underline mt-0.5"
                                    >
                                      Apply
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Priority suggestion */}
                              {suggestion.data.priority === "urgent" && (
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] text-[var(--text-secondary)]">This sounds time-sensitive</p>
                                    <button
                                      onClick={() => {
                                        updateTask(suggestion.taskId, { priority: "urgent" });
                                        setSuggestion(null);
                                        toast("Marked urgent", "success");
                                      }}
                                      className="text-[12px] text-[var(--accent-blue)] hover:underline mt-0.5"
                                    >
                                      Mark urgent
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Subtasks suggestion */}
                              {Array.isArray(suggestion.data.subtasks) && (suggestion.data.subtasks as string[]).length > 0 && (
                                <div className="flex items-start gap-2">
                                  <Check className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] text-[var(--text-secondary)] mb-1">Break into checklist:</p>
                                    <ul className="space-y-0.5">
                                      {(suggestion.data.subtasks as string[]).map((s, i) => (
                                        <li key={i} className="text-[13px] text-[var(--text-primary)] flex items-center gap-1.5">
                                          <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] shrink-0" />
                                          {s}
                                        </li>
                                      ))}
                                    </ul>
                                    <button
                                      onClick={() => {
                                        const checklist = (suggestion.data!.subtasks as string[]).map((text) => ({ text, done: false }));
                                        updateTask(suggestion.taskId, { checklist });
                                        setSuggestion(null);
                                        toast("Checklist added", "success");
                                        fetchTasks();
                                      }}
                                      className="text-[12px] text-[var(--accent-blue)] hover:underline mt-1"
                                    >
                                      Add checklist
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Clarify question */}
                              {!!suggestion.data.clarify && (
                                <div className="flex items-start gap-2">
                                  <HelpCircle className="h-3.5 w-3.5 text-[var(--text-tertiary)] mt-0.5 shrink-0" />
                                  <p className="text-[13px] text-[var(--text-secondary)]">{String(suggestion.data.clarify)}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <button
                  onClick={() => { setShowAdd(true); if (activeBlock?.roleId) loadBacklog(activeBlock.roleId); }}
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
    </>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {/* Role transition dialog */}
      {transitionRole && (
        <RoleHandoff
          roleId={transitionRole.roleId}
          roleName={transitionRole.roleName}
          roleColor={transitionRole.roleColor}
          roleTitle={transitionRole.roleTitle}
          onDismiss={() => setTransitionRole(null)}
          onPause={(minutes) => {
            setTransitionRole(null);
            setPauseUntil(Date.now() + minutes * 60_000);
          }}
          onSkip={() => {
            setTransitionRole(null);
            // Stay on previous block
            const prevIdx = currentBlockIdx > 0 ? currentBlockIdx - 1 : 0;
            setBlockOverrideIdx(prevIdx);
          }}
        />
      )}

      {/* Morning briefing — shows once per day */}
      <MorningBriefing />

      {/* Desktop: 2-column layout — agenda sidebar + main content */}
      <div className="hidden lg:flex gap-6 items-start">
        <div
          className="shrink-0 sticky top-4 transition-all duration-300 max-h-[calc(100vh-4rem)]"
          style={{ width: agendaCollapsed ? 200 : 320 }}
        >
          <AgendaStrip
            mode="sidebar"
            sidebarCollapsed={agendaCollapsed}
            onToggleCollapse={toggleAgenda}
          />
        </div>
        <div className="flex-1 min-w-0">
          {mainContent}
        </div>
      </div>

      {/* Mobile: stacked layout */}
      <div className="lg:hidden">
        <AgendaStrip />
        {mainContent}
      </div>
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
  for (const s of BOARD_COLUMNS) {
    grouped[s] = tasks.filter((t) => t.status === s);
  }

  // Drawer state
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const drawerTask = drawerTaskId ? tasks.find((t) => t.id === drawerTaskId) || null : null;

  // Mobile: status filter
  const [mobileFilter, setMobileFilter] = useState<string>("all");
  const filteredTasks = mobileFilter === "all" ? tasks : tasks.filter((t) => t.status === mobileFilter);

  return (
    <>
      {/* Desktop: board columns + done */}
      <div className="hidden md:grid gap-4" style={{ gridTemplateColumns: `repeat(${BOARD_COLUMNS.length + 1}, minmax(0, 1fr))` }}>
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
                    onClick={() => setDrawerTaskId(task.id)}
                    onComplete={onComplete}
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
              onClick={() => setDrawerTaskId(task.id)}
              onComplete={onComplete}
            />
          ))}
          {filteredTasks.length === 0 && (
            <p className="text-[var(--text-tertiary)] text-sm py-16 text-center">No tasks</p>
          )}
        </div>
      </div>
      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setDrawerTaskId(null)}
        onUpdate={onUpdate}
        onStatusChange={onStatusChange}
        onComplete={onComplete}
        onDelete={onDelete}
      />
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
  onClick,
  onComplete,
}: {
  task: Task;
  status: string;
  roleColor: string;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onClick: () => void;
  onComplete: (id: string) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const borderColor = STATUS_CONFIG[status]?.text || "var(--border-subtle)";

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
          draggable={!!onDragStart}
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
                      style={{ background: `${t.tag.color}20`, color: t.tag.color }}
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
