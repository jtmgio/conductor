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

const SNOOZE_MS = 300_000; // "snooze 5 min" on a critical reminder

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
 * Mandatory health/routine reminders — each fires as a big centered modal you have
 * to deal with (not a corner banner). One at a time. Timed reminders (stretch) run a
 * countdown; the rest have a big action button. Critical ones (meds) offer Snooze
 * instead of Skip so they can't be waved off — they come back.
 */
export function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<Record<string, number>>({}); // id -> seconds left
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  const prevDueRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(running);
  runningRef.current = running;

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

  // Re-evaluate the clock every 10s so a reminder appears promptly at its time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const acknowledge = useCallback(async (id: string) => {
    setAcked((prev) => new Set(prev).add(id)); // optimistic
    setRunning((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await fetch(`/api/reminders/${id}/ack`, { method: "POST" });
    } catch {}
  }, []);

  const snooze = useCallback((id: string) => {
    setSnoozedUntil((prev) => ({ ...prev, [id]: Date.now() + SNOOZE_MS }));
  }, []);

  const startTimer = useCallback((id: string, mins: number) => {
    setRunning((prev) => ({ ...prev, [id]: mins * 60 }));
  }, []);

  // Countdown tick for timed reminders — auto-completes at zero
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
  const due = reminders.filter(
    (r) => isDue(r, now) && !acked.has(r.id) && !(snoozedUntil[r.id] !== undefined && nowMs < snoozedUntil[r.id])
  );

  // Chime once when a reminder newly becomes due
  useEffect(() => {
    const dueIds = due.map((r) => r.id);
    const isNew = dueIds.some((id) => !prevDueRef.current.has(id));
    prevDueRef.current = new Set(dueIds);
    if (isNew) playSound("checkin");
  }, [due]);

  const active = due[0] ?? null;
  if (!active) return null;

  const Icon = ICONS[active.icon ?? ""] ?? Pill;
  const secsLeft = running[active.id];
  const isRunning = secsLeft !== undefined;
  const isTimed = !!active.durationMin;
  const isCritical = active.tier === "critical";
  const actionLabel = active.icon === "pill" || active.icon === "syringe" ? "Taken" : "Done";

  return (
    <AnimatePresence>
      <motion.div
        key={active.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-amber-950/40 p-5 backdrop-blur-xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: "spring", damping: 24, stiffness: 300 }}
          className="w-full max-w-sm rounded-3xl border border-amber-500/40 bg-[var(--surface)] p-8 text-center shadow-2xl"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15">
            <Icon className="h-8 w-8 text-amber-400" />
          </div>

          {isTimed && isRunning ? (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/80">In progress</p>
              <h2 className="mt-1.5 text-[24px] font-bold tracking-tight text-[var(--text-primary)]">{active.label}</h2>
              <div className="mt-5 text-[56px] font-bold leading-none tabular-nums text-amber-400">{mmss(secsLeft)}</div>
              <button
                onClick={() => acknowledge(active.id)}
                className="mt-7 w-full rounded-xl border border-[var(--border-subtle)] py-3 text-[13px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
              >
                Finish now
              </button>
            </>
          ) : (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/80">
                {isCritical ? "Don't skip this" : isTimed ? "Time to move" : "Reminder"}
              </p>
              <h2 className="mt-1.5 text-[24px] font-bold tracking-tight text-[var(--text-primary)]">{active.label}</h2>
              <p className="mt-1 text-[13.5px] text-[var(--text-tertiary)]">
                {formatTime(active.hour, active.minute)}
                {isTimed ? ` · ${active.durationMin} min` : ""}
              </p>

              <div className="mt-7 flex flex-col gap-2.5">
                {isTimed ? (
                  <button
                    onClick={() => startTimer(active.id, active.durationMin!)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-[15px] font-bold text-amber-950 transition-opacity hover:opacity-90"
                  >
                    <Play className="h-4 w-4" />
                    Start
                  </button>
                ) : (
                  <button
                    onClick={() => acknowledge(active.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-[15px] font-bold text-amber-950 transition-opacity hover:opacity-90"
                  >
                    <Check className="h-4 w-4" />
                    {actionLabel}
                  </button>
                )}

                {isCritical ? (
                  <button
                    onClick={() => snooze(active.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] py-3 text-[13px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Snooze 5 min
                  </button>
                ) : (
                  <button
                    onClick={() => acknowledge(active.id)}
                    className="w-full rounded-xl border border-[var(--border-subtle)] py-3 text-[13px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
                  >
                    Skip
                  </button>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
