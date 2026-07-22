"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Check, Plus, ChevronRight, Moon, X } from "lucide-react";
import { AgendaStrip } from "./AgendaStrip";
import { CommsCoverStrip } from "./CommsCoverStrip";

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
  scheduledFor: string | null;
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
 * The v2 Today cockpit — one company, one thing at a time. Two columns:
 * meetings pinned left (1/3), the one-thing flow right (2/3). Reminders + the
 * transition ritual are mounted globally by AppShell; the comms bar is inline here.
 */
export function TodayCockpit({ currentBlock, offClockMessage }: { currentBlock: BlockInfo | null; nextBlocks?: BlockInfo[]; offClockMessage?: string | null }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clear, setClear] = useState<ClearRole[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [restOpen, setRestOpen] = useState(true);
  const router = useRouter();
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [capture, setCapture] = useState("");
  const [showEod, setShowEod] = useState(false);

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

  // Gentle end-of-day tee-up: after 3:30pm on weekdays, once/day, dismissible.
  useEffect(() => {
    const check = () => {
      const d = new Date();
      const weekday = d.getDay() >= 1 && d.getDay() <= 5;
      const afterEod = d.getHours() * 60 + d.getMinutes() >= 15 * 60 + 30;
      const dismissed = localStorage.getItem("conductor-eod-teeup") === d.toDateString();
      setShowEod(weekday && afterEod && !dismissed);
    };
    check();
    const i = setInterval(check, 60_000);
    return () => clearInterval(i);
  }, []);

  const dismissEod = useCallback(() => {
    localStorage.setItem("conductor-eod-teeup", new Date().toDateString());
    setShowEod(false);
  }, []);

  const complete = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
    } catch {}
  }, []);

  const setSchedule = useCallback(
    async (id: string, iso: string | null) => {
      try {
        await fetch(`/api/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledFor: iso }),
        });
      } catch {}
      fetchTasks();
    },
    [fetchTasks]
  );

  const submitCapture = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = capture.trim();
      if (!text || !roleId) return;
      setCapture("");
      const now2 = new Date();
      const iso = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}-${String(now2.getDate()).padStart(2, "0")}`;
      try {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // captured while working this company -> lands on today, not the deep backlog
          body: JSON.stringify({ roleId, title: text, status: "backlog", scheduledFor: iso }),
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

  // "Today" = scheduled for today/past, or actively in-flight. Deep backlog stays on the Board.
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const isForToday = (t: Task) => {
    if (t.status === "in_progress" || t.status === "in_review" || t.status === "blocked") return true;
    if (!t.scheduledFor) return false;
    const d = new Date(t.scheduledFor);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` <= todayStr;
  };
  const todayTasks = tasks.filter(isForToday);
  const backlog = tasks.filter((t) => !isForToday(t));
  const one = todayTasks[0];
  const rest = todayTasks.slice(1);

  const startMin = currentBlock.startHour * 60 + currentBlock.startMinute;
  const endMin = currentBlock.endHour * 60 + currentBlock.endMinute;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const span = Math.max(1, endMin - startMin);
  const pct = Math.max(0, Math.min(100, Math.round(((nowMin - startMin) / span) * 100)));
  const left = Math.max(0, endMin - nowMin);
  const into = Math.max(0, nowMin - startMin);

  const others = clear.filter((c) => c.id !== roleId);

  return (
    <div className="mx-auto max-w-5xl pt-2">
      {/* Block header — full width */}
      <section className="mb-5">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 0 4px ${color}22` }} />
          <h1 className="text-[24px] font-bold leading-none tracking-tight sm:text-[30px]" style={{ color }}>
            {currentBlock.roleName}
          </h1>
          <span className="text-[13px] font-medium text-[var(--text-secondary)] tabular-nums">{currentBlock.timeLabel}</span>
          <button
            onClick={() => router.push("/plan")}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
          >
            <Moon className="h-3.5 w-3.5" />
            Plan tomorrow
          </button>
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

      {/* Comms bar — inline, prominent, full width */}
      <div className="mb-6">
        <CommsCoverStrip />
      </div>

      {/* Gentle end-of-day tee-up */}
      {showEod && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3">
          <Moon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <span className="flex-1 text-[13.5px] text-[var(--text-secondary)]">Winding down — want to line up tomorrow&apos;s stack?</span>
          <button onClick={() => router.push("/plan")} className="rounded-lg bg-[var(--text-primary)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--surface)] transition-opacity hover:opacity-90">
            Plan tomorrow
          </button>
          <button onClick={dismissEod} aria-label="Dismiss" className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Two columns: meetings (1/3, sticky) · one-thing flow (2/3) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <aside className="order-2 lg:order-1 lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
          <AgendaStrip mode="strip" />
        </aside>

        <div className="order-1 lg:order-2 lg:col-span-2">
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
                <p className="mt-2 text-[14px] text-[var(--text-secondary)]">
                  Nothing on today for {currentBlock.roleName}. {backlog.length > 0 ? "Pull something from the backlog below, or coast." : "Coast to the block change, or capture a thought below."}
                </p>
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

          {/* Pull from backlog — deep backlog lives here + on the Board, not in the one-thing flow */}
          {backlog.length > 0 && (
            <div className="mt-3">
              <button onClick={() => setBacklogOpen((v) => !v)} className="flex items-center gap-1.5 px-1 py-1.5 text-[12.5px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${backlogOpen ? "rotate-90" : ""}`} />
                Pull from {currentBlock.roleName} backlog · {backlog.length}
              </button>
              <AnimatePresence initial={false}>
                {backlogOpen && (
                  <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    {backlog.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 border-t border-[var(--border-subtle)] px-1 py-2.5">
                        <button
                          onClick={() => setSchedule(t.id, todayStr)}
                          aria-label="Pull into today"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--border-strong)] text-[var(--text-tertiary)] transition-colors hover:border-[color:var(--text-secondary)] hover:text-[var(--text-secondary)]"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <span className="flex-1 truncate text-[14px] text-[var(--text-tertiary)]">{t.title}</span>
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
      </div>
    </div>
  );
}
