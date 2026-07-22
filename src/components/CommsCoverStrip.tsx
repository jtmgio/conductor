"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, MessageSquareDashed, X } from "lucide-react";
import { playSound } from "@/lib/sounds";

interface CommsCover {
  offClock: boolean;
  dueNow: boolean;
  dueBlockId: string | null;
  nextSweepLabel: string | null;
  nextSweepInMin: number | null;
  nextSweepBlockId: string | null;
}

interface Company {
  id: string;
  name: string;
  color: string;
  platform: string;
}

/**
 * The permission-not-to-check signal. Calm "comms covered · next sweep at HH:MM"
 * by default; flips to a gentle amber "sweep now" (never a modal nag) when a block
 * boundary has passed unswept. Completing a sweep resets it — DB-backed, so the
 * state survives restarts and follows the user across devices.
 */
export function CommsCoverStrip() {
  const [data, setData] = useState<CommsCover | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const prevDueRef = useRef(false);

  const fetchCover = useCallback(async () => {
    try {
      const res = await fetch("/api/comms-cover");
      if (res.ok) setData(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchCover();
    const interval = setInterval(fetchCover, 60_000);
    return () => clearInterval(interval);
  }, [fetchCover]);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => (r.ok ? r.json() : []))
      .then((roles: Array<{ id: string; name: string; color: string; platform?: string; active?: boolean }>) => {
        setCompanies(
          roles
            .filter((r) => r.active !== false && r.platform)
            .map((r) => ({ id: r.id, name: r.name, color: r.color, platform: r.platform as string }))
        );
      })
      .catch(() => {});
  }, []);

  // Chime once when a sweep newly becomes due
  useEffect(() => {
    const due = !!data && !data.offClock && data.dueNow;
    if (due && !prevDueRef.current) playSound("checkin");
    prevDueRef.current = due;
  }, [data]);

  const completeSweep = useCallback(async () => {
    const blockId = data?.dueBlockId ?? data?.nextSweepBlockId ?? null;
    try {
      const res = await fetch("/api/comms-cover/sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId }),
      });
      if (res.ok) setData(await res.json());
    } catch {}
    setPanelOpen(false);
    setChecked(new Set());
  }, [data]);

  if (!data || data.offClock) return null;

  const due = data.dueNow;

  return (
    <>
      <div className="fixed bottom-4 left-4 z-40 hidden lg:block">
        <button
          onClick={() => due && setPanelOpen(true)}
          className={
            due
              ? "flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.13] px-3.5 py-2.5 text-[13px] shadow-lg transition-colors hover:bg-amber-500/20"
              : "flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[13px] cursor-default"
          }
        >
          {due ? (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/20">
                <MessageSquareDashed className="h-3.5 w-3.5 text-amber-400" />
              </span>
              <span className="font-semibold text-amber-300">Sweep comms</span>
              <span className="text-amber-300/70">— 5 min</span>
            </>
          ) : (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/15">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              </span>
              <span className="text-[var(--text-secondary)]">Comms covered</span>
              {data.nextSweepLabel && (
                <span className="text-[var(--text-tertiary)]">
                  · next sweep {data.nextSweepInMin != null && data.nextSweepInMin <= 90 ? `in ${data.nextSweepInMin} min` : data.nextSweepLabel}
                </span>
              )}
            </>
          )}
        </button>
      </div>

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setPanelOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl"
            >
              <div className="flex items-start justify-between px-5 pt-5 pb-3">
                <div>
                  <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">Comms sweep</h2>
                  <p className="mt-0.5 text-[13px] text-[var(--text-tertiary)]">Glance, reply-or-flag, come back. ~5 min.</p>
                </div>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-secondary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5 px-4 pb-2">
                {companies.map((c) => {
                  const on = checked.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        setChecked((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                      className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="flex-1 text-[14px] font-medium text-[var(--text-primary)]">{c.name}</span>
                      <span className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">{c.platform}</span>
                      <span
                        className={
                          on
                            ? "flex h-5 w-5 items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/15"
                            : "flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border-strong)]"
                        }
                      >
                        <Check className={on ? "h-3 w-3 text-emerald-400" : "h-3 w-3 text-transparent"} />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="px-4 pb-4 pt-2">
                <button
                  onClick={completeSweep}
                  className="w-full rounded-xl bg-[var(--text-primary)] py-3 text-[14px] font-semibold text-[var(--surface)] transition-opacity hover:opacity-90"
                >
                  Done — comms covered
                </button>
                <p className="mt-2 text-center text-[11px] text-[var(--text-tertiary)]">Checking every one is optional. Done is done.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
