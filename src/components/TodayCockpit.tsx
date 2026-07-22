"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus, ChevronRight, Moon } from "lucide-react";
import { AgendaStrip } from "./AgendaStrip";

interface BlockInfo {
  id: string;
  timeLabel: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  roleId: string | null;
  roleName?: string;
  roleColor?: string;
  roleTitle?: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  sourceType: string | null;
}

interface ClearRole {
  id: string;
  name: string;
  color: string;
  quiet: boolean;
  dueToday?: number;
  staleFollowups?: number;
}

const SOURCE_LABEL: Record<string, string> = { linear: "Linear", calendar: "Calendar", granola: "Granola", mcp: "MCP" };

function isToday(dateStr: string | null, now: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * The v2 Today cockpit — one company, one thing at a time. Replaces the old
 * board/list FocusView. The comms strip, reminders, and transition ritual are
 * mounted globally by AppShell; this screen is: block header → your one thing →
 * the rest (collapsed) → all-clear for the other companies → agenda → capture.
 */
export function TodayCockpit({ currentBlock, offClockMessage }: { currentBlock: BlockInfo | null; nextBlocks?: BlockInfo[]; offClockMessage?: string | null }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clear, setClear] = useState<ClearRole[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [restOpen, setRestOpen] = useState(true);
  const [capture, setCapture] = useState("");

  const roleId = currentBlock?.roleId ?? null;
  const color = currentBlock?.roleColor || "#7ba3d9";

  const fetchTasks = useCallback(async () => {
    if (!roleId) {
      setTasks([]);
      return;
    }
    try {
      const r = await fetch(`/api/tasks?roleId=${roleId}`);
      if (r.ok) setTasks(await r.json());
    } catch {}
  }, [roleId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const load = () =>
      fetch("/api/all-clear")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setClear(d.roles))
        .catch(() => {});
    load();
    const i = setInterval(load, 60_000);
    return () => clearInterval(i);
  }, [roleId]);

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);

  const complete = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await fetch(`/api/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: true }),
        });
      } catch {}
    },
    []
  );

  const submitCapture = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = capture.trim();
      if (!text || !roleId) return;
      setCapture("");
      try {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId, title: text, status: "backlog" }),
        });
      } catch {}
      fetchTasks();
    },
    [capture, roleId, fetchTasks]
  );

  // Off the clock — calm, no tasks
  if (!currentBlock || !roleId) {
    return (
      <div className="mx-auto max-w-2xl pt-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-raised)]">
          <Moon className="h-6 w-6 text-[var(--text-tertiary)]" />
        </div>
        <h1 className="text-[22px] font-semibold text-[var(--text-secondary)]">{offClockMessage || "Off the clock"}</h1>
        <p className="mt-2 text-[14px] text-[var(--text-tertiary)]">Nothing scheduled right now — nobody expects you. Comms sweeps pause too.</p>
      </div>
    );
  }

  const one = tasks[0];
  const rest = tasks.slice(1);

  const startMin = currentBlock.startHour * 60 + currentBlock.startMinute;
  const endMin = currentBlock.endHour * 60 + currentBlock.endMinute;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const span = Math.max(1, endMin - startMin);
  const pct = Math.max(0, Math.min(100, Math.round(((nowMin - startMin) / span) * 100)));
  const left = Math.max(0, endMin - nowMin);
  const into = Math.max(0, nowMin - startMin);

  const others = clear.filter((c) => c.id !== roleId);

  return (
    <div className="mx-auto max-w-2xl pt-2">
      {/* Block header */}
      <section className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 0 4px ${color}22` }} />
          <h1 className="text-[30px] font-bold leading-none tracking-tight" style={{ color }}>
            {currentBlock.roleName}
          </h1>
          <span className="ml-auto text-[13px] font-medium text-[var(--text-secondary)] tabular-nums">{currentBlock.timeLabel}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--surface-raised)]">
          <motion.div className="h-full rounded-full" style={{ backgroundColor: color, opacity: 0.8 }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
        </div>
        <div className="mt-2 flex gap-1.5 text-[12px] text-[var(--text-tertiary)] tabular-nums">
          <span>{into} min in</span>
          <span>·</span>
          <span>{left} min left</span>
        </div>
      </section>

      {/* Your one thing */}
      <AnimatePresence mode="popLayout">
        {one ? (
          <motion.section
            key={one.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 60, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-5"
          >
            <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: color, opacity: 0.85 }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
              Your one thing
            </p>
            <div className="mt-2.5 flex items-start gap-4">
              <button
                onClick={() => complete(one.id)}
                aria-label="Mark done"
                className="mt-0.5 h-6 w-6 shrink-0 rounded-lg border-[1.75px] transition-colors hover:bg-[color:var(--surface)]"
                style={{ borderColor: `${color}88` }}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-[19px] font-semibold leading-snug tracking-tight text-[var(--text-primary)]">{one.title}</h2>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px] font-semibold capitalize text-[var(--text-secondary)]">
                    {one.status.replace("_", " ")}
                  </span>
                  {isToday(one.dueDate, now) && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/[0.13] px-2.5 py-1 text-[11.5px] font-semibold text-amber-400">Due today</span>
                  )}
                  {one.sourceType && SOURCE_LABEL[one.sourceType] && (
                    <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-tertiary)]">
                      {SOURCE_LABEL[one.sourceType]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="clear"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
              {currentBlock.roleName} — clear
            </p>
            <p className="mt-2 text-[14px] text-[var(--text-secondary)]">Nothing left queued for {currentBlock.roleName}. Coast to the block change, or capture your next thing below.</p>
          </motion.section>
        )}
      </AnimatePresence>

      {/* The rest — collapsed */}
      {rest.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setRestOpen((v) => !v)} className="flex items-center gap-1.5 px-1 py-1.5 text-[12.5px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${restOpen ? "rotate-90" : ""}`} />
            {rest.length} more for {currentBlock.roleName}
          </button>
          <AnimatePresence initial={false}>
            {restOpen && (
              <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                {rest.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 border-t border-[var(--border-subtle)] px-1 py-2.5">
                    <button
                      onClick={() => complete(t.id)}
                      aria-label="Mark done"
                      className="h-4 w-4 shrink-0 rounded border-[1.5px] border-[var(--border-strong)] transition-colors hover:border-[color:var(--text-secondary)]"
                    />
                    <span className="flex-1 truncate text-[14px] text-[var(--text-secondary)]">{t.title}</span>
                    {isToday(t.dueDate, now) && <span className="shrink-0 text-[11px] font-semibold text-amber-400">Due today</span>}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* All-clear for the other companies */}
      {others.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 px-1">
          {others.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-[12.5px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color, opacity: c.quiet ? 0.5 : 1 }} />
              {c.quiet ? (
                <span className="flex items-center gap-1 text-[var(--text-tertiary)]">
                  {c.name}
                  <Check className="h-3 w-3 text-emerald-500" />
                  quiet
                </span>
              ) : (
                <span className="text-[var(--text-secondary)]">
                  {c.name} · <b className="font-semibold text-[var(--text-primary)]">{c.dueToday ? `${c.dueToday} due today` : `${c.staleFollowups} waiting`}</b>
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Agenda (keeps meeting alerts alive) */}
      <div className="mt-6">
        <AgendaStrip mode="strip" />
      </div>

      {/* Quick capture */}
      <form onSubmit={submitCapture} className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-1">
        <Plus className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
        <input
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          placeholder={`Capture a thought for ${currentBlock.roleName}…`}
          className="flex-1 bg-transparent py-3 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
      </form>
    </div>
  );
}
