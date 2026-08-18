"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { MessageSquareDashed, Check, Clock } from "lucide-react";
import { playSound } from "@/lib/sounds";

interface CommsCover {
  offClock: boolean;
  dueNow: boolean;
  nextSweepLabel: string | null;
  nextSweepInMin: number | null;
  intervalMin: number;
}

const SNOOZE_MS = 300_000; // 5 minutes — an escape hatch for when you're mid-sentence

/**
 * "Go check your messages" as a modal you have to deal with, not a banner you can
 * scroll past.
 *
 * One line, no per-company breakdown. The checklist this replaced didn't match how the
 * sweep actually happens: one pass through everything, not six separate errands.
 *
 * Mounted in AppShell so it reaches you on any page — same as the health reminders.
 */
export function CommsSweepAlert() {
  const [data, setData] = useState<CommsCover | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [sweeping, setSweeping] = useState(false);
  const wasDue = useRef(false);

  const fetchCover = useCallback(async () => {
    try {
      const res = await fetch("/api/comms-cover");
      if (res.ok) setData(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchCover();
    // A 20-minute cadence needs a tighter poll than the old hourly-ish one, or the
    // alert lands up to a minute late every time.
    const interval = setInterval(fetchCover, 30_000);
    const onSwept = () => fetchCover();
    window.addEventListener("comms-swept", onSwept);
    return () => {
      clearInterval(interval);
      window.removeEventListener("comms-swept", onSwept);
    };
  }, [fetchCover]);

  const due = !!data && !data.offClock && data.dueNow && Date.now() >= snoozedUntil;

  // Chime once as it becomes due
  useEffect(() => {
    if (due && !wasDue.current) playSound("checkin");
    wasDue.current = due;
  }, [due]);

  const sweep = useCallback(async () => {
    setSweeping(true);
    try {
      const res = await fetch("/api/comms-cover/sweep", { method: "POST" });
      if (res.ok) setData(await res.json());
      window.dispatchEvent(new Event("comms-swept"));
    } catch {}
    setSweeping(false);
  }, []);

  if (!due) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-amber-950/40 p-5 backdrop-blur-xl"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 300 }}
        className="w-full max-w-sm rounded-3xl border border-amber-500/40 bg-[var(--surface)] p-8 text-center shadow-2xl"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15">
          <MessageSquareDashed className="h-8 w-8 text-amber-400" />
        </div>

        <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/80">Comms sweep</p>
        <h2 className="mt-1.5 text-[24px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
          Check Slack, Teams, and messages
        </h2>

        <div className="mt-7 flex flex-col gap-2.5">
          <button
            onClick={sweep}
            disabled={sweeping}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-[15px] font-bold text-amber-950 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            Swept
          </button>
          <button
            onClick={() => setSnoozedUntil(Date.now() + SNOOZE_MS)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] py-3 text-[13px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            <Clock className="h-3.5 w-3.5" />
            Snooze 5 min
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
