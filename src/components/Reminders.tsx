"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Syringe, GlassWater, PersonStanding, Check, Play, Clock } from "lucide-react";
import { playSound } from "@/lib/sounds";

interface Reminder {
  id: string;
  label: string;
  hour: number;
  minute: number;
  days: number[]; // 0=Sun .. 6=Sat
  icon: string | null;
  durationMin: number | null;
  tier: string; // "critical" | "normal"
  ackedToday: boolean;
}

const ICONS: Record<string, typeof Pill> = {
  pill: Pill,
  syringe: Syringe,
  shake: GlassWater,
  stretch: PersonStanding,
};

// Escalation timings
const CRIT_TAKEOVER_MS = 120_000; // critical: ignored 2 min -> full-screen takeover
const NORMAL_RECHIME_MS = 600_000; // normal: ignored 10 min -> a second gentle chime
const SNOOZE_MS = 300_000; // "snooze 5 min" from the takeover

function isDue(r: Reminder, now: Date): boolean {
  if (r.ackedToday) return false;
  if (!r.days.includes(now.getDay())) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= r.hour * 60 + r.minute;
}

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return minute === 0 ? `${h} ${period}` : `${h}:${minute.toString().padStart(2, "0")} ${period}`;
}

function mmss(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Mandatory health/routine reminders. Amber banner stack at the bottom-center.
 * Tiered escalation: a "critical" reminder (meds) ignored past CRIT_TAKEOVER_MS
 * becomes a full-screen takeover that can't be dismissed without acting or snoozing;
 * a "normal" reminder just re-chimes and stays a banner. Timed reminders (stretch)
 * run a countdown that auto-completes.
 */
export function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const [running, setRunning] = useState<Record<string, number>>({}); // id -> seconds left
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({}); // id -> ms epoch
  const [takeoverId, setTakeoverId] = useState<string | null>(null);
  const prevDueRef = useRef<Set<string>>(new Set());
  const firstSeenRef = useRef<Record<string, number>>({});
  const rechimedRef = useRef<Set<string>>(new Set());

  // refs mirror latest state for the interval to read
  const runningRef = useRef(running);
  runningRef.current = running;
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;
  const ackedRef = useRef(acked);
  ackedRef.current = acked;
  const snoozeRef = useRef(snoozedUntil);
  snoozeRef.current = snoozedUntil;
  const takeoverRef = useRef(takeoverId);
  takeoverRef.current = takeoverId;

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      if (res.ok) setReminders(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchReminders();
    const interval = setInterval(fetchReminders, 60_000);
    return () => clearInterval(interval);
  }, [fetchReminders]);

  const acknowledge = useCallback(async (id: string) => {
    setAcked((prev) => new Set(prev).add(id)); // optimistic
    setRunning((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTakeoverId((cur) => (cur === id ? null : cur));
    try {
      await fetch(`/api/reminders/${id}/ack`, { method: "POST" });
    } catch {}
  }, []);

  const snooze = useCallback((id: string) => {
    setSnoozedUntil((prev) => ({ ...prev, [id]: Date.now() + SNOOZE_MS }));
    setTakeoverId((cur) => (cur === id ? null : cur));
    delete firstSeenRef.current[id]; // restart escalation after the snooze
    rechimedRef.current.delete(id);
  }, []);

  const isSnoozed = useCallback((id: string, nowMs: number) => {
    const until = snoozeRef.current[id];
    return until !== undefined && nowMs < until;
  }, []);

  const currentlyDue = useCallback((now: Date, nowMs: number) => {
    return remindersRef.current.filter(
      (r) => isDue(r, now) && !ackedRef.current.has(r.id) && !isSnoozed(r.id, nowMs)
    );
  }, [isSnoozed]);

  // Clock re-eval + escalation, every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const nowMs = Date.now();
      const due = currentlyDue(now, nowMs);

      for (const r of due) {
        if (firstSeenRef.current[r.id] === undefined) firstSeenRef.current[r.id] = nowMs;
        const elapsed = nowMs - firstSeenRef.current[r.id];

        if (r.tier === "critical" && !takeoverRef.current && elapsed >= CRIT_TAKEOVER_MS) {
          setTakeoverId(r.id);
          playSound("checkin");
        } else if (r.tier !== "critical" && elapsed >= NORMAL_RECHIME_MS && !rechimedRef.current.has(r.id)) {
          rechimedRef.current.add(r.id);
          playSound("checkin");
        }
      }
      setTick((t) => t + 1); // refresh banners / snooze expiry
    }, 5000);
    return () => clearInterval(interval);
  }, [currentlyDue]);

  // Countdown tick for timed reminders
  useEffect(() => {
    const interval = setInterval(() => {
      const cur = runningRef.current;
      if (Object.keys(cur).length === 0) return;
      const next: Record<string, number> = {};
      const done: string[] = [];
      for (const [id, s] of Object.entries(cur)) {
        if (s <= 1) done.push(id);
        else next[id] = s - 1;
      }
      setRunning(next);
      done.forEach((id) => {
        playSound("checkin");
        acknowledge(id);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [acknowledge]);

  const now = new Date();
  const nowMs = Date.now();
  const due = reminders.filter((r) => isDue(r, now) && !acked.has(r.id) && !isSnoozed(r.id, nowMs));

  // Chime once when a reminder newly becomes due
  useEffect(() => {
    const dueIds = due.map((r) => r.id);
    const isNew = dueIds.some((id) => !prevDueRef.current.has(id));
    prevDueRef.current = new Set(dueIds);
    if (isNew) playSound("checkin");
  }, [due]);

  const startTimer = useCallback((id: string, mins: number) => {
    setRunning((prev) => ({ ...prev, [id]: mins * 60 }));
  }, []);

  const takeover = takeoverId ? due.find((r) => r.id === takeoverId) ?? null : null;

  if (due.length === 0) return null;

  const bannerList = due.filter((r) => r.id !== takeoverId);

  return (
    <>
      {/* Gentle banner stack (normal reminders + not-yet-escalated criticals) */}
      <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 pointer-events-none lg:bottom-6">
        <AnimatePresence>
          {bannerList.map((r) => {
            const Icon = ICONS[r.icon ?? ""] ?? Pill;
            const secsLeft = running[r.id];
            const isRunning = secsLeft !== undefined;
            const isTimed = !!r.durationMin;
            const actionLabel = r.icon === "pill" || r.icon === "syringe" ? "Taken" : "Done";
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ type: "spring", damping: 24, stiffness: 320 }}
                className="pointer-events-auto w-full max-w-sm flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-[var(--surface-raised)] px-4 py-3 shadow-2xl ring-1 ring-amber-500/10"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                  <Icon className="h-4 w-4 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{r.label}</p>
                  <p className="text-[12px] text-[var(--text-tertiary)]">
                    Reminder · {formatTime(r.hour, r.minute)}
                    {isTimed && !isRunning ? ` · ${r.durationMin} min` : ""}
                  </p>
                </div>

                {isRunning ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/15 px-3.5 py-2 text-[13px] font-semibold text-amber-300 tabular-nums">
                    {mmss(secsLeft)}
                  </span>
                ) : isTimed ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => startTimer(r.id, r.durationMin!)}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-[13px] font-medium text-amber-300 transition-colors hover:bg-amber-500/25"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start
                    </button>
                    <button
                      onClick={() => acknowledge(r.id)}
                      className="rounded-lg px-2 py-2 text-[12px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
                    >
                      Skip
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => acknowledge(r.id)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/15 px-3.5 py-2 text-[13px] font-medium text-amber-300 transition-colors hover:bg-amber-500/25"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {actionLabel}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Critical takeover — full-screen, can't be dismissed without acting or snoozing */}
      <AnimatePresence>
        {takeover && (() => {
          const Icon = ICONS[takeover.icon ?? ""] ?? Pill;
          const actionLabel = takeover.icon === "pill" || takeover.icon === "syringe" ? "Taken" : "Done";
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[85] flex items-center justify-center bg-amber-950/40 backdrop-blur-xl p-5"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ type: "spring", damping: 24, stiffness: 300 }}
                className="w-full max-w-sm rounded-3xl border border-amber-500/40 bg-[var(--surface)] p-7 text-center shadow-2xl"
              >
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15">
                  <Icon className="h-8 w-8 text-amber-400" />
                </div>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/80">Don&apos;t skip this</p>
                <h2 className="mt-1.5 text-[24px] font-bold tracking-tight text-[var(--text-primary)]">{takeover.label}</h2>
                <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
                  Due at {formatTime(takeover.hour, takeover.minute)} · still waiting
                </p>
                <div className="mt-6 flex flex-col gap-2.5">
                  <button
                    onClick={() => acknowledge(takeover.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-[15px] font-bold text-amber-950 transition-opacity hover:opacity-90"
                  >
                    <Check className="h-4 w-4" />
                    {actionLabel}
                  </button>
                  <button
                    onClick={() => snooze(takeover.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] py-3 text-[13px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Snooze 5 min
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </>
  );
}
