"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ArrowRight } from "lucide-react";

interface Task {
  id: string;
  title: string;
  status: string;
  scheduledFor: string | null;
  role: { id: string; name: string; color: string };
}

// The companies worth planning for (mirrors the all-clear active list).
const ACTIVE_COMPANIES = ["vquip", "zeta", "healthmap", "healthme"];
function isActiveCompany(name: string): boolean {
  const n = name.toLowerCase();
  return ACTIVE_COMPANIES.some((a) => n.includes(a));
}

const pad = (n: number) => String(n).padStart(2, "0");
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Next working day (Fri/Sat/Sun → Mon), as a local YYYY-MM-DD + a friendly label. */
function nextWorkingDay(): { iso: string; label: string } {
  const d = new Date();
  const dow = d.getDay();
  const add = dow === 5 ? 3 : dow === 6 ? 2 : 1;
  d.setDate(d.getDate() + add);
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const label = d.toLocaleDateString("en-US", { weekday: "long" });
  return { iso, label };
}

/**
 * The optional "line up tomorrow" tee-up. Cross-company picker: tap tasks to
 * schedule them for the next working day. Best practice is end-of-day (closure +
 * a ready morning), but it's reachable anytime and never forced.
 */
export function PlanTomorrow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const { iso: tomorrowIso, label: tomorrowLabel } = nextWorkingDay();

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks");
      if (r.ok) setTasks(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const isOnTomorrow = (t: Task) => !!t.scheduledFor && ymd(new Date(t.scheduledFor)) === tomorrowIso;

  const toggle = useCallback(
    async (t: Task) => {
      const on = isOnTomorrow(t);
      const next = on ? null : `${tomorrowIso}T00:00:00.000Z`;
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, scheduledFor: next } : x)));
      try {
        await fetch(`/api/tasks/${t.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledFor: on ? null : tomorrowIso }),
        });
      } catch {}
    },
    [tomorrowIso] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Group active-company tasks by company
  const groups: Array<{ role: Task["role"]; items: Task[] }> = [];
  for (const t of tasks) {
    if (!t.role || !isActiveCompany(t.role.name)) continue;
    let g = groups.find((x) => x.role.id === t.role.id);
    if (!g) {
      g = { role: t.role, items: [] };
      groups.push(g);
    }
    g.items.push(t);
  }
  const pickedCount = tasks.filter(isOnTomorrow).length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl"
          >
            <div className="flex items-start justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">Line up {tomorrowLabel}</h2>
                <p className="mt-0.5 text-[13px] text-[var(--text-tertiary)]">Tap a few per company — they&apos;ll be waiting when you land in each block.</p>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-secondary)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-2">
              {groups.length === 0 && <p className="px-1 py-6 text-center text-[13px] text-[var(--text-tertiary)]">Nothing to schedule — capture as you go.</p>}
              {groups.map((g) => (
                <div key={g.role.id} className="mb-4">
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.role.color }} />
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{g.role.name}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {g.items.map((t) => {
                      const on = isOnTomorrow(t);
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggle(t)}
                          className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
                        >
                          <span
                            className={
                              on
                                ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/15"
                                : "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--border-strong)]"
                            }
                          >
                            <Check className={on ? "h-3 w-3 text-emerald-400" : "h-3 w-3 text-transparent"} />
                          </span>
                          <span className={`flex-1 text-[14px] ${on ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{t.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border-subtle)] px-5 py-3.5">
              <button
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] py-3 text-[14px] font-semibold text-[var(--surface)] transition-opacity hover:opacity-90"
              >
                {pickedCount > 0 ? `${tomorrowLabel} is set — ${pickedCount} queued` : `Done`}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
