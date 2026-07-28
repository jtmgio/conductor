"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { taskKey, type KeyedTask, type KeyedRole } from "@/lib/task-key";

interface TaskKeyChipProps {
  task: KeyedTask;
  role: KeyedRole | null | undefined;
  /** `chip` sits among status pills; `inline` is a quieter run of text. */
  variant?: "chip" | "inline";
  className?: string;
}

/**
 * The task's human key, click-to-copy. Renders nothing when the task has no key.
 *
 * Shared because the key shows up in three places (cockpit card, task detail,
 * board drawer) and each one wanting its own clipboard handler is how you end up
 * with three subtly different copy behaviors.
 */
export function TaskKeyChip({ task, role, variant = "chip", className = "" }: TaskKeyChipProps) {
  const [copied, setCopied] = useState(false);
  const key = taskKey(task, role);
  if (!key) return null;

  const copy = async (e: React.MouseEvent) => {
    // These chips often sit inside a click-to-open card — copying shouldn't also navigate.
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (non-secure context) — the key is still selectable */
    }
  };

  const base =
    variant === "chip"
      ? "rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px]"
      : "rounded-md px-1.5 py-0.5 text-[11px] hover:bg-[var(--surface-raised)]";

  return (
    <button
      onClick={copy}
      title={copied ? "Copied" : `Copy ${key}`}
      aria-label={`Copy task key ${key}`}
      className={`group/key inline-flex items-center gap-1.5 font-mono tracking-wide text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)] ${base} ${className}`}
    >
      {key}
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover/key:opacity-100" />
      )}
    </button>
  );
}
