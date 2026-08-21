"use client";

import { useEffect, useState, useCallback } from "react";
import { acquireAlert, releaseAlert, isOutranked } from "@/lib/alert-lock";
import { motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { playSound } from "@/lib/sounds";

export interface TransitionBlock {
  id?: string;
  roleId: string | null;
  roleName?: string | null;
  roleColor?: string | null;
  timeLabel: string;
}


/**
 * The between-blocks ritual. A calm full-screen takeover: close the last block,
 * park stray thoughts (so they don't get carried into the next block as anxiety),
 * sweep comms once, then see the next block's single task. ~20 seconds. Escape
 * never traps — dismissing just leaves the comms sweep pending.
 */
export function BlockTransition({
  from,
  to,
  onClose,
}: {
  from: TransitionBlock;
  to: TransitionBlock;
  onClose: () => void;
}) {
  const [park, setPark] = useState("");
  const [oneTask, setOneTask] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toColor = to.roleColor || "#7ba3d9";
  const fromColor = from.roleColor || "#b09cf0";

  useEffect(() => {
    if (!to.roleId) return;
    fetch(`/api/tasks?roleId=${to.roleId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((tasks: Array<{ title: string; status: string; dueDate: string | null }>) => {
        // Mirror the cockpit: blocked isn't work you can do, and the headline
        // should be the most urgent thing rather than whatever came back first.
        const todayStr = new Date().toISOString().slice(0, 10);
        const tier = (t: { dueDate: string | null }) => {
          const due = t.dueDate ? t.dueDate.slice(0, 10) : null;
          if (due && due < todayStr) return 0;
          if (due === todayStr) return 1;
          return 2;
        };
        const actionable = tasks
          .filter((t) => t.status !== "blocked")
          .sort((a, b) => tier(a) - tier(b) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
        setOneTask(actionable[0]?.title ?? null);
      })
      .catch(() => {});
  }, [to.roleId]);

  const start = useCallback(async () => {
    setSubmitting(true);
    const roleForPark = from.roleId ?? to.roleId;
    const lines = park.split("\n").map((s) => s.trim()).filter(Boolean);
    try {
      if (roleForPark && lines.length) {
        await Promise.all(
          lines.map((line) =>
            fetch("/api/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ roleId: roleForPark, title: line, status: "backlog", sourceType: "park" }),
            })
          )
        );
      }
      await fetch("/api/comms-cover/sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId: from.id ?? null }),
      }).catch(() => {});
    } catch {}
    playSound("transition");
    onClose();
  }, [park, from, to, onClose]);

  useEffect(() => {
    acquireAlert("blockTransition");
    return () => releaseAlert("blockTransition");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // This listener used to sit on window with `Enter && !shiftKey` submitting.
      // Two things went wrong. The textarea says "Park it — one per line", but
      // Enter closed the dialog, so line two was unreachable unless you guessed
      // Shift+Enter (nothing said so). And because it was bound to window, it
      // still fired while this dialog was occluded by another alert — pressing
      // Enter at "Check Slack" silently started the next block instead.
      if (isOutranked("blockTransition")) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, start]);


  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--surface)]/85 backdrop-blur-xl p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", damping: 24, stiffness: 320 }}
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-7 shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-secondary)]"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 1 · closure */}
        <h2 className="text-[21px] font-bold tracking-tight" style={{ color: fromColor }}>
          {from.roleName || "That block"} complete.
        </h2>
        <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">Nothing to tally. Just close the tab in your head.</p>

        <div className="my-5 border-t border-[var(--border-subtle)]" />

        {/* 2 · park */}
        <label className="text-[14px] font-semibold text-[var(--text-primary)]">Anything still open up there?</label>
        <textarea
          autoFocus
          value={park}
          onChange={(e) => setPark(e.target.value)}
          placeholder="Park it — one per line. Enter makes a new line; ⌘Enter starts the block."
          className="mt-2 min-h-[58px] w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[13.5px] text-[var(--text-primary)] outline-none focus-visible:border-[var(--border-strong)]"
        />

        <div className="my-5 border-t border-[var(--border-subtle)]" />

        {/* 4 · next up */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: toColor }} />
            <b className="text-[15px] font-bold" style={{ color: toColor }}>
              {to.roleName || "Next"}
            </b>
            <span className="ml-auto text-[12px] text-[var(--text-tertiary)]">{to.timeLabel}</span>
          </div>
          <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Your one thing</p>
          <p className="mt-1 text-[14px] font-medium text-[var(--text-primary)]">
            {oneTask || "Nothing queued — pick your first thing when you land."}
          </p>
        </div>

        <button
          onClick={start}
          disabled={submitting}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold text-[var(--surface)] transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: toColor }}
        >
          Start {to.roleName || "next block"}
          <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-2 text-center text-[11.5px] text-[var(--text-tertiary)]">
          ⌘Enter to start · Esc to skip
        </p>
      </motion.div>
    </motion.div>
  );
}
