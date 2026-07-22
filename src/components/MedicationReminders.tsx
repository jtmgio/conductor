"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Check } from "lucide-react";
import { playSound } from "@/lib/sounds";

interface Reminder {
  id: string;
  label: string;
  hour: number;
  minute: number;
  days: number[]; // 0=Sun .. 6=Sat
  ackedToday: boolean;
}

// A reminder is "due" if today's a scheduled day, the local clock has reached
// its time, and it hasn't been acknowledged today.
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

export function MedicationReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const prevDueRef = useRef<Set<string>>(new Set());

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      if (res.ok) setReminders(await res.json());
    } catch {}
  }, []);

  // Initial load + poll (also catches the daily ack reset at midnight)
  useEffect(() => {
    fetchReminders();
    const interval = setInterval(fetchReminders, 60_000);
    return () => clearInterval(interval);
  }, [fetchReminders]);

  // Re-evaluate the clock every 15s so a reminder appears promptly at its time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  const now = new Date();
  const due = reminders.filter((r) => isDue(r, now) && !acked.has(r.id));

  // Chime once when a reminder newly becomes due
  useEffect(() => {
    const dueIds = due.map((r) => r.id);
    const isNew = dueIds.some((id) => !prevDueRef.current.has(id));
    prevDueRef.current = new Set(dueIds);
    if (isNew) playSound("checkin");
  }, [due]);

  const acknowledge = useCallback(async (id: string) => {
    setAcked((prev) => new Set(prev).add(id)); // optimistic
    try {
      await fetch(`/api/reminders/${id}/ack`, { method: "POST" });
    } catch {}
  }, []);

  if (due.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 pointer-events-none lg:bottom-6">
      <AnimatePresence>
        {due.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            className="pointer-events-auto w-full max-w-sm flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-[var(--surface-raised)] px-4 py-3 shadow-2xl ring-1 ring-amber-500/10"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
              <Pill className="h-4 w-4 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{r.label}</p>
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Reminder · {formatTime(r.hour, r.minute)}
              </p>
            </div>
            <button
              onClick={() => acknowledge(r.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/15 px-3.5 py-2 text-[13px] font-medium text-amber-300 transition-colors hover:bg-amber-500/25"
            >
              <Check className="h-3.5 w-3.5" />
              Taken
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
