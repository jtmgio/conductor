"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, MessageSquareDashed } from "lucide-react";

interface CommsCover {
  offClock: boolean;
  dueNow: boolean;
  nextSweepLabel: string | null;
  nextSweepInMin: number | null;
  intervalMin: number;
}

/**
 * The permission-not-to-check signal: "comms covered · next sweep in 12 min".
 *
 * The nagging half of this moved to CommsSweepAlert, which takes the screen when a sweep
 * is due. What's left is the calm state — the line that tells you it's fine not to be
 * looking at Slack right now. The per-company checklist that used to live here is gone:
 * a sweep is one pass through everything, not six errands to tick off.
 */
export function CommsCoverStrip() {
  const [data, setData] = useState<CommsCover | null>(null);

  const fetchCover = useCallback(async () => {
    try {
      const res = await fetch("/api/comms-cover");
      if (res.ok) setData(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchCover();
    const interval = setInterval(fetchCover, 30_000);
    const onSwept = () => fetchCover();
    window.addEventListener("comms-swept", onSwept);
    return () => {
      clearInterval(interval);
      window.removeEventListener("comms-swept", onSwept);
    };
  }, [fetchCover]);

  const sweep = useCallback(async () => {
    try {
      const res = await fetch("/api/comms-cover/sweep", { method: "POST" });
      if (res.ok) setData(await res.json());
      window.dispatchEvent(new Event("comms-swept"));
    } catch {}
  }, []);

  if (!data || data.offClock) return null;

  // While a sweep is due the modal is up; the strip stays quiet rather than
  // saying the same thing twice.
  if (data.dueNow) return null;

  return (
    <div className="mb-3">
      <button
        onClick={sweep}
        title="Mark comms swept now"
        className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 text-[13.5px] transition-colors hover:border-[var(--border-strong)]"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/15">
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        <span className="text-[var(--text-secondary)]">Comms covered</span>
        {data.nextSweepInMin != null && (
          <span className="text-[var(--text-tertiary)]">· next sweep in {data.nextSweepInMin} min</span>
        )}
        <MessageSquareDashed className="ml-auto h-3.5 w-3.5 text-[var(--text-tertiary)]" />
      </button>
    </div>
  );
}
