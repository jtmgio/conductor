"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Pill, Syringe, GlassWater, PersonStanding, Laptop, Check, Play, Clock, Armchair } from "lucide-react";
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
  laptop: Laptop,
};

const SNOOZE_MS = 300_000; // "snooze 5 min" on a critical reminder

/** A finished timer shouldn't just vanish — it earns a closing instruction. */
const DONE_MS = 120_000; // auto-clears if you walked away from the desk

/**
 * Reminder state that must outlive the component.
 *
 * Every page renders its own <AppShell>, so a client-side navigation unmounts
 * <Reminders /> and takes its React state with it. Without this, walking from Focus to
 * Board mid-stretch dropped the running timer, re-showed the "Start" modal, and a Skip
 * there acked the reminder for the whole day — the stand-up simply vanished.
 *
 * Timers are stored as an absolute end time, not seconds remaining, so a restored
 * countdown is still honest (and a throttled background tab can't stretch 15 minutes
 * into 20).
 */
const STATE_KEY = "conductor-reminder-state";

interface PersistedState {
  date: string;                    // guards against yesterday's state leaking into today
  timers: Record<string, number>;  // reminder id -> epoch ms the timer ends
  snoozed: Record<string, number>; // reminder id -> epoch ms until it may return
  acked: string[];
  chimed: string[];                // already announced today; navigation shouldn't re-chime
}

function dayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function emptyState(): PersistedState {
  return { date: dayKey(), timers: {}, snoozed: {}, acked: [], chimed: [] };
}

function loadState(): PersistedState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.date !== dayKey()) return emptyState();
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

function saveState(state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}

function doneMessage(label: string): string {
  if (/stand/i.test(label)) return "Time to sit down";
  if (/stretch/i.test(label)) return "Nice — back to it";
  return "Done";
}

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
  const [running, setRunning] = useState<Record<string, number>>({}); // id -> epoch ms it ends
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({});
  const [completed, setCompleted] = useState<{ id: string; label: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [, setTick] = useState(0);
  const [chimed, setChimed] = useState<Set<string>>(new Set());
  const runningRef = useRef(running);
  runningRef.current = running;
  const remindersRef = useRef(reminders);
  remindersRef.current = reminders;

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

  // Pick up where the last page left off
  useEffect(() => {
    const s = loadState();
    setRunning(s.timers);
    setSnoozedUntil(s.snoozed);
    setAcked(new Set(s.acked));
    setChimed(new Set(s.chimed));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // never write the empty pre-hydration state over real state
    saveState({
      date: dayKey(),
      timers: running,
      snoozed: snoozedUntil,
      acked: Array.from(acked),
      chimed: Array.from(chimed),
    });
  }, [hydrated, running, snoozedUntil, acked, chimed]);

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
    setRunning((prev) => ({ ...prev, [id]: Date.now() + mins * 60_000 }));
  }, []);

  // Countdown tick for timed reminders — auto-completes when the deadline passes
  useEffect(() => {
    const interval = setInterval(() => {
      const cur = runningRef.current;
      if (Object.keys(cur).length === 0) return;
      const nowMs = Date.now();
      const done = Object.entries(cur).filter(([, endsAt]) => endsAt <= nowMs).map(([id]) => id);
      if (done.length === 0) {
        setTick((t) => t + 1); // redraw the mm:ss
        return;
      }
      setRunning((prev) => {
        const next = { ...prev };
        done.forEach((id) => delete next[id]);
        return next;
      });
      done.forEach((id) => {
        playSound("bell");
        const label = remindersRef.current.find((r) => r.id === id)?.label ?? "";
        setCompleted({ id, label });
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

  // Chime once per reminder per day — remounting on every page change shouldn't re-announce
  const dueKey = due.map((r) => r.id).join(",");
  useEffect(() => {
    if (!hydrated || !dueKey) return;
    const fresh = dueKey.split(",").filter((id) => !chimed.has(id));
    if (fresh.length === 0) return;
    setChimed((prev) => new Set([...Array.from(prev), ...fresh]));
    playSound("checkin");
  }, [hydrated, dueKey, chimed]);

  useEffect(() => {
    if (!completed) return;
    const t = setTimeout(() => setCompleted(null), DONE_MS);
    return () => clearTimeout(t);
  }, [completed]);

  // A finished timer announces itself, then clears itself if you're away from the desk
  const active = due[0] ?? null;

  if (completed) {
    const isStand = /stand/i.test(completed.label);
    const DoneIcon = isStand ? Armchair : Check;
    return (
      <>
        <motion.div
          key="completed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-emerald-950/40 p-5 backdrop-blur-xl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
            className="w-full max-w-sm rounded-3xl border border-emerald-500/40 bg-[var(--surface)] p-8 text-center shadow-2xl"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15">
              <DoneIcon className="h-8 w-8 text-emerald-400" />
            </div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-emerald-400/80">
              {completed.label} complete
            </p>
            <h2 className="mt-1.5 text-[24px] font-bold tracking-tight text-[var(--text-primary)]">
              {doneMessage(completed.label)}
            </h2>
            <button
              onClick={() => setCompleted(null)}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-[15px] font-bold text-emerald-950 transition-opacity hover:opacity-90"
            >
              <Check className="h-4 w-4" />
              Got it
            </button>
          </motion.div>
        </motion.div>
      </>
    );
  }

  if (!active) return null;

  const Icon = ICONS[active.icon ?? ""] ?? Pill;
  const endsAt = running[active.id];
  const isRunning = endsAt !== undefined;
  const secsLeft = isRunning ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : 0;
  const isTimed = !!active.durationMin;
  const isCritical = active.tier === "critical";
  const actionLabel = active.icon === "pill" || active.icon === "syringe" ? "Taken" : "Done";

  // A running timer shouldn't block the app — compact pill top-right, keep working.
  if (isTimed && isRunning) {
    return (
      <>
        <motion.div
          key="timer"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 24, stiffness: 300 }}
          className="fixed right-4 top-4 z-[80] flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-[var(--surface)] py-2.5 pl-3.5 pr-2.5 shadow-2xl"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15">
            <Icon className="h-5 w-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-400/80">{active.label}</p>
            <p className="text-[20px] font-bold leading-tight tabular-nums text-amber-400">{mmss(secsLeft)}</p>
          </div>
          <button
            onClick={() => acknowledge(active.id)}
            className="ml-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            Finish
          </button>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <motion.div
        key="prompt"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-amber-950/40 p-5 backdrop-blur-xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", damping: 24, stiffness: 300 }}
          className="w-full max-w-sm rounded-3xl border border-amber-500/40 bg-[var(--surface)] p-8 text-center shadow-2xl"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15">
            <Icon className="h-8 w-8 text-amber-400" />
          </div>

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
        </motion.div>
      </motion.div>
    </>
  );
}
