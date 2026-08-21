"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { acquireAlert, releaseAlert } from "@/lib/alert-lock";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarClock, Check, ClipboardList } from "lucide-react";
import { playSound } from "@/lib/sounds";

interface Meeting {
  id: string;
  title: string;
  date: string;
  startTime: string; // "HH:MM"
  endTime: string;
  role: { name: string; color: string };
  prepTask: { title: string; done: boolean } | null;
}

const LEAD_KEY = "conductor-meeting-alert-lead-minutes";
const DISMISS_KEY = "conductor-meeting-alert-dismissed";
const DEFAULT_LEAD = 2;

/** Once the meeting is this far underway the alert stops nagging — you're either in it or you're not. */
const GRACE_MIN = 2;

export function getMeetingAlertLead(): number {
  if (typeof window === "undefined") return DEFAULT_LEAD;
  const stored = parseInt(localStorage.getItem(LEAD_KEY) || "", 10);
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_LEAD;
}

export function setMeetingAlertLead(minutes: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LEAD_KEY, String(minutes));
}

/** Dismissals are per-day so a page refresh doesn't re-fire an alert you already waved off. */
function loadDismissed(today: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date: string; ids: string[] };
    return parsed.date === today ? new Set(parsed.ids) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(today: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ date: today, ids: Array.from(ids) }));
  } catch {}
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minutesUntil(startTime: string, now: Date): number {
  const [h, m] = startTime.split(":").map(Number);
  return h * 60 + m - (now.getHours() * 60 + now.getMinutes());
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

/**
 * "Your meeting starts in 2 minutes" — the same unmissable centered modal the health
 * reminders use, because a browser notification you never granted permission for is a
 * reminder that doesn't exist. Mounted app-wide, so it fires on whatever page you're on.
 */
export function MeetingAlert() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const chimedRef = useRef<Set<string>>(new Set());

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings");
      if (res.ok) setMeetings(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    setDismissed(loadDismissed(todayLocal()));
    fetchMeetings();
    const interval = setInterval(fetchMeetings, 120_000);
    return () => clearInterval(interval);
  }, [fetchMeetings]);

  // Re-evaluate the clock every 10s so a 2-minute warning is actually ~2 minutes
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      saveDismissed(todayLocal(), next);
      return next;
    });
  }, []);

  const now = new Date();
  const today = todayLocal();
  const lead = getMeetingAlertLead();

  const due = meetings.filter((m) => {
    if (m.date !== today) return false;
    if (dismissed.has(m.id)) return false;
    const until = minutesUntil(m.startTime, now);
    return until <= lead && until >= -GRACE_MIN;
  });

  // Chime once per meeting, the moment it enters the window
  const dueIds = due.map((m) => m.id).join(",");
  useEffect(() => {
    if (!dueIds) return;
    const isNew = dueIds.split(",").some((id) => !chimedRef.current.has(id));
    dueIds.split(",").forEach((id) => chimedRef.current.add(id));
    if (isNew) playSound("meeting");
  }, [dueIds]);

  const active = due[0] ?? null;

  // Highest-priority alert — it holds the lock so lower ones stay off the
  // screen and ⌘K stays shut while it is up.
  useEffect(() => {
    if (!active) return;
    acquireAlert("meeting");
    return () => releaseAlert("meeting");
  });

  if (!active) return null;

  const until = minutesUntil(active.startTime, now);
  const headline = until <= 0 ? "Starting now" : until === 1 ? "In 1 minute" : `In ${until} minutes`;
  const prep = active.prepTask && !active.prepTask.done ? active.prepTask.title.replace(/^\d{1,2}:\d{2}\s*[—–-]\s*/, "") : null;

  return (
    <AnimatePresence>
      <motion.div
        key={active.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[88] flex items-center justify-center bg-black/50 p-5 backdrop-blur-xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: "spring", damping: 24, stiffness: 300 }}
          className="w-full max-w-sm rounded-3xl border bg-[var(--surface)] p-8 text-center shadow-2xl"
          style={{ borderColor: `${active.role.color}66` }}
        >
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${active.role.color}26` }}
          >
            <CalendarClock className="h-8 w-8" style={{ color: active.role.color }} />
          </div>

          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: active.role.color }}>
            {headline}
          </p>
          <h2 className="mt-1.5 text-[24px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
            {active.title}
          </h2>
          <p className="mt-1 text-[13.5px] text-[var(--text-tertiary)]">
            {formatTime(active.startTime)} · {active.role.name}
          </p>

          {prep && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[var(--border-subtle)] p-3.5 text-left">
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
              <p className="text-[13px] leading-snug text-[var(--text-secondary)]">{prep}</p>
            </div>
          )}

          <button
            onClick={() => dismiss(active.id)}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: active.role.color }}
          >
            <Check className="h-4 w-4" />
            Got it
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
