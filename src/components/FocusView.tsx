"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TaskItem } from "./TaskItem";
import { MorningPick } from "./MorningPick";
import { Plus, Sparkles, Moon, Inbox, Users, MessageSquare, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface Task {
  id: string;
  title: string;
  priority: string;
  roleId: string;
  isToday: boolean;
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
  offClockMessage: string | null;
}

export function FocusView({ currentBlock, nextBlocks, offClockMessage }: FocusViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showMorning, setShowMorning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

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

  const completeTask = async (id: string) => {
    await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    setTasks((prev) => prev.filter((t) => t.id !== id));
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
    if (!newTaskTitle.trim() || !currentBlock?.roleId) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId: currentBlock.roleId, title: newTaskTitle, isToday: true }),
    });
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

  // First-run welcome
  if (allTasks.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="py-12">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[var(--surface-raised)] flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-[var(--text-tertiary)]" />
          </div>
        </div>
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Welcome to Conductor</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5">Your 6-role operating system. Start by adding tasks.</p>
        </div>
        <div className="space-y-3">
          <Link href="/inbox" className="flex items-center gap-4 border border-[var(--border-subtle)] rounded-xl p-4 hover:bg-[var(--sidebar-hover)] transition-colors">
            <Inbox className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-[var(--text-primary)]">Add your first tasks</p>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">Paste a transcript or add tasks manually</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          </Link>
          <Link href="/settings" className="flex items-center gap-4 border border-[var(--border-subtle)] rounded-xl p-4 hover:bg-[var(--sidebar-hover)] transition-colors">
            <Users className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-[var(--text-primary)]">Set up your team</p>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">Add staff to each role for smart drafting</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          </Link>
          <Link href="/ai" className="flex items-center gap-4 border border-[var(--border-subtle)] rounded-xl p-4 hover:bg-[var(--sidebar-hover)] transition-colors">
            <MessageSquare className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-[var(--text-primary)]">Talk to AI</p>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">Ask questions about your schedule or draft messages</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          </Link>
        </div>
      </motion.div>
    );
  }

  // Off the clock
  if (offClockMessage) {
    return (
      <div className="py-20 text-center">
        <Moon className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-4" />
        <p className="text-2xl font-bold text-[var(--text-primary)]">{offClockMessage}</p>
        <p className="text-[15px] text-[var(--text-tertiary)] mt-2">Back at it tomorrow.</p>
      </div>
    );
  }

  const currentRoleTasks = currentBlock?.roleId
    ? tasks.filter((t) => t.roleId === currentBlock.roleId)
    : tasks;

  const comingUp = (nextBlocks || []).slice(0, 3);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {currentBlock && (
        <section className="mb-8">
          <p className="text-[15px] text-[var(--text-tertiary)] mb-1.5">{currentBlock.timeLabel}</p>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[40px] font-bold leading-tight" style={{ color: currentBlock.roleColor || "#e8e6e1" }}>
              {currentBlock.roleName || "Triage"}
            </h1>
            <span className="w-2 h-2 rounded-full animate-pulse shrink-0 mt-1" style={{ backgroundColor: currentBlock.roleColor || "#706c65" }} />
          </div>
          {currentBlock.roleTitle && (
            <p className="text-[15px] text-[var(--text-secondary)] mt-0.5">{currentBlock.roleTitle}</p>
          )}
        </section>
      )}

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {currentRoleTasks.map((task) => (
            <TaskItem key={task.id} id={task.id} title={task.title} priority={task.priority} roleColor={task.role.color} onComplete={completeTask} />
          ))}
        </AnimatePresence>
      </div>

      {currentRoleTasks.length === 0 && currentBlock && (
        <div className="py-16 text-center">
          <Sparkles className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="text-lg font-semibold text-[var(--text-primary)]">All clear</p>
          <p className="text-[15px] text-[var(--text-tertiary)] mt-1">Nothing on deck for this block</p>
          <button onClick={() => setShowAdd(true)} className="mt-4 text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
            Pull from backlog &rarr;
          </button>
        </div>
      )}

      {currentBlock?.roleId && currentRoleTasks.length > 0 && (
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
              className="flex items-center justify-center gap-2 py-3 text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors rounded-2xl border border-dashed border-[var(--border-default)] hover:border-[var(--text-tertiary)] w-full"
            >
              <Plus className="h-4 w-4" /> Add task
            </button>
          )}
        </div>
      )}

      {comingUp.length > 0 && (
        <section className="mt-10">
          <p className="text-[13px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Coming up</p>
          <div className="space-y-2.5">
            {comingUp.map((block, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[13px] text-[var(--text-tertiary)] w-[80px] shrink-0">{block.timeLabel}</span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: block.roleColor || "#706c65" }} />
                <span className="text-[15px] text-[var(--text-secondary)] truncate">{block.roleName || "Open"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}
