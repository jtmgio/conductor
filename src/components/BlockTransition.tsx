"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, ArrowRight, X } from "lucide-react";
import { playSound } from "@/lib/sounds";

export interface TransitionBlock {
  id?: string;
  roleId: string | null;
  roleName?: string | null;
  roleColor?: string | null;
  timeLabel: string;
}

interface Company {
  id: string;
  name: string;
  color: string;
  platform: string;
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [swept, setSwept] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const toColor = to.roleColor || "#7ba3d9";
  const fromColor = from.roleColor || "#b09cf0";

  useEffect(() => {
    if (!to.roleId) return;
    fetch(`/api/tasks?roleId=${to.roleId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((tasks: Array<{ title: string }>) => setOneTask(tasks[0]?.title ?? null))
      .catch(() => {});
  }, [to.roleId]);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => (r.ok ? r.json() : []))
      .then((roles: Array<{ id: string; name: string; color: string; platform?: string; active?: boolean }>) =>
        setCompanies(
          roles
            .filter((r) => r.active !== false && r.platform)
            .map((r) => ({ id: r.id, name: r.name, color: r.color, platform: r.platform as string }))
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--surface)]/85 backdrop-blur-xl p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", damping: 24, stiffness: 320 }}
        className="relative w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-7 shadow-2xl"
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
          value={park}
          onChange={(e) => setPark(e.target.value)}
          placeholder="Park it — one per line. Files itself so you don't carry it into the next block."
          className="mt-2 min-h-[58px] w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[13.5px] text-[var(--text-primary)] outline-none focus-visible:border-[var(--border-strong)]"
        />

        <div className="my-5 border-t border-[var(--border-subtle)]" />

        {/* 3 · sweep */}
        <p className="text-[14px] font-semibold text-[var(--text-primary)]">Sweep comms — about 5 minutes</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {companies.map((c) => {
            const on = swept.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() =>
                  setSwept((prev) => {
                    const next = new Set(prev);
                    if (next.has(c.id)) next.delete(c.id);
                    else next.add(c.id);
                    return next;
                  })
                }
                className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="flex-1 text-[13.5px] font-medium text-[var(--text-primary)]">{c.name}</span>
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
      </motion.div>
    </motion.div>
  );
}
