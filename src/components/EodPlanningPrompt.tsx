"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Clock, X } from "lucide-react";
import { todayISO, parseDateOnly, nextWorkingDay, formatDateOnly } from "@/lib/dates";

const SNOOZE_KEY = "conductor-eod-snooze-until"; // ms timestamp
const SKIP_KEY = "conductor-eod-skipped-for"; // YYYY-MM-DD
const SNOOZE_USED_KEY = "conductor-eod-snooze-used-on"; // YYYY-MM-DD; one snooze per day
const PROMPT_HOUR = 16;
const PROMPT_MINUTE = 45;
const SNOOZE_MINUTES = 30;

/**
 * End-of-day planning prompt — fires at 4:45pm Mon–Fri if the user hasn't
 * yet finished planning the next working day. Single source of truth is
 * UserProfile.lastPlannedFor (server). Snooze and skip are local-only.
 *
 * On Friday, target is Monday (per spec — Saturday/Sunday don't get plans).
 */
export function EodPlanningPrompt() {
  const [show, setShow] = useState(false);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [targetDayName, setTargetDayName] = useState<string>("");

  const computeTarget = useCallback((): { iso: string; dayName: string } | null => {
    const t = parseDateOnly(todayISO());
    if (!t) return null;
    const next = nextWorkingDay(t);
    return {
      iso: formatDateOnly(next)!,
      dayName: next.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    };
  }, []);

  const check = useCallback(async () => {
    if (typeof window === "undefined") return;

    // 1) Day-of-week gate — Mon-Fri only.
    const now = new Date();
    const dow = now.getDay();
    if (dow === 0 || dow === 6) return;

    // 2) Time gate — at or after 4:45pm local.
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes < PROMPT_HOUR * 60 + PROMPT_MINUTE) return;

    // 3) Skip-today gate.
    const tIso = todayISO();
    if (localStorage.getItem(SKIP_KEY) === tIso) return;

    // 4) Snooze gate.
    const snoozeUntil = parseInt(localStorage.getItem(SNOOZE_KEY) || "0", 10);
    if (snoozeUntil && Date.now() < snoozeUntil) return;

    // 5) Server gate — already planned the next working day?
    const target = computeTarget();
    if (!target) return;
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const profile = await res.json();
        const planned = profile?.lastPlannedFor ? String(profile.lastPlannedFor).slice(0, 10) : null;
        if (planned && planned >= target.iso) return;
      }
    } catch {
      return;
    }

    setTargetDate(target.iso);
    setTargetDayName(target.dayName);
    setShow(true);
  }, [computeTarget]);

  useEffect(() => {
    check();
    const interval = setInterval(check, 60_000); // re-check every minute
    return () => clearInterval(interval);
  }, [check]);

  // Manual trigger — bypasses time/weekday/snooze/skip/lastPlannedFor gates.
  // Useful for testing the modal flow without waiting until 4:45pm.
  useEffect(() => {
    const handler = () => {
      const target = computeTarget();
      if (!target) return;
      setTargetDate(target.iso);
      setTargetDayName(target.dayName);
      setShow(true);
    };
    window.addEventListener("eod-trigger-now", handler);
    return () => window.removeEventListener("eod-trigger-now", handler);
  }, [computeTarget]);

  const onPlan = () => {
    if (!targetDate) return;
    setShow(false);
    // Hand off to FocusView (mounted at /). It listens for this event.
    window.dispatchEvent(new CustomEvent("eod-plan-day", { detail: { targetDate } }));
    // If we're not on the focus page, navigate there.
    if (window.location.pathname !== "/") {
      window.location.href = "/";
    }
  };

  const onSnooze = () => {
    const tIso = todayISO();
    const snoozeUsedOn = localStorage.getItem(SNOOZE_USED_KEY);
    if (snoozeUsedOn === tIso) {
      // Already snoozed once today — drop silently. Per spec, no third nag.
      localStorage.setItem(SKIP_KEY, tIso);
    } else {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MINUTES * 60 * 1000));
      localStorage.setItem(SNOOZE_USED_KEY, tIso);
    }
    setShow(false);
  };

  const onSkipToday = () => {
    localStorage.setItem(SKIP_KEY, todayISO());
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onSnooze}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[var(--surface)] border border-[var(--border-subtle)] rounded-3xl p-7 shadow-2xl"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-blue)]/15 flex items-center justify-center">
                <Moon className="w-6 h-6 text-[var(--accent-blue)]" />
              </div>
              <button
                onClick={onSnooze}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="Snooze"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h2 className="text-[22px] font-bold text-[var(--text-primary)] leading-tight">
              Set {targetDayName} up so you can stop thinking about it.
            </h2>
            <p className="text-[15px] text-[var(--text-tertiary)] mt-2 leading-relaxed">
              Pick the tasks you want on {targetDayName}'s list now. In-progress and calendar prep are pre-checked — your evening is yours.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={onPlan}
                className="w-full py-3.5 bg-[var(--accent-blue)] text-white text-[16px] font-semibold rounded-2xl hover:opacity-90 active:scale-[0.99] transition-all"
              >
                Plan {targetDayName}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onSnooze}
                  className="flex-1 py-2.5 bg-[var(--surface-raised)] text-[var(--text-secondary)] text-[14px] font-medium rounded-xl hover:text-[var(--text-primary)] transition-colors flex items-center justify-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  Snooze 30m
                </button>
                <button
                  onClick={onSkipToday}
                  className="flex-1 py-2.5 bg-[var(--surface-raised)] text-[var(--text-secondary)] text-[14px] font-medium rounded-xl hover:text-[var(--text-primary)] transition-colors"
                >
                  Skip today
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
