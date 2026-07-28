"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Trash2 } from "lucide-react";
import { TaskKeyChip } from "./TaskKeyChip";

export interface ChecklistItem {
  text: string;
  done?: boolean;
}

export interface DetailTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
  checklist: ChecklistItem[] | null;
  sourceType: string | null;
  number?: number | null;
  externalKey?: string | null;
  role?: { id: string; name: string; color: string; taskPrefix?: string | null };
}

const SOURCE_LABEL: Record<string, string> = { linear: "Linear", calendar: "Calendar", granola: "Granola", mcp: "MCP", siri: "Siri" };

function formatDue(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Lightweight task detail — right-side drawer showing the title, the AI-refined
 * notes, and a checkable checklist. Complete or delete from here. (No AI-chat/files;
 * that heavier drawer lives on the Board.)
 */
export function TaskDetail({
  task,
  color,
  onClose,
  onComplete,
  onDelete,
  onToggleChecklist,
}: {
  task: DetailTask | null;
  color: string;
  onClose: () => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleChecklist: (id: string, idx: number) => void;
}) {
  return (
    <AnimatePresence>
      {task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex justify-end bg-black/40"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 48, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--surface)]"
          >
            <div className="flex items-start justify-between gap-3 p-6 pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1 text-[11.5px] font-semibold capitalize text-[var(--text-secondary)]">
                  {task.status.replace("_", " ")}
                </span>
                {task.dueDate && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/[0.13] px-2.5 py-1 text-[11.5px] font-semibold text-amber-400">Due {formatDue(task.dueDate)}</span>
                )}
                {task.sourceType && SOURCE_LABEL[task.sourceType] && (
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-tertiary)]">{SOURCE_LABEL[task.sourceType]}</span>
                )}
              </div>
              <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-secondary)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 px-6 pt-4">
              <h2 className="text-[20px] font-semibold leading-snug tracking-tight text-[var(--text-primary)]">{task.title}</h2>
              <TaskKeyChip task={task} role={task.role} variant="inline" className="mt-2" />

              {task.notes && (
                <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text-secondary)]">{task.notes}</p>
              )}

              {task.checklist && task.checklist.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Checklist · {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
                  </p>
                  <div className="flex flex-col">
                    {task.checklist.map((c, i) => (
                      <button key={i} onClick={() => onToggleChecklist(task.id, i)} className="flex items-center gap-3 py-2 text-left">
                        <span
                          className={
                            c.done
                              ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/15"
                              : "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--border-strong)]"
                          }
                        >
                          <Check className={c.done ? "h-3 w-3 text-emerald-400" : "h-3 w-3 text-transparent"} />
                        </span>
                        <span className={`text-[14px] ${c.done ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-secondary)]"}`}>{c.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!task.notes && (!task.checklist || task.checklist.length === 0) && (
                <p className="mt-4 text-[13.5px] text-[var(--text-tertiary)]">No notes on this one.</p>
              )}
            </div>

            <div className="flex gap-2 border-t border-[var(--border-subtle)] p-4">
              <button
                onClick={() => {
                  onComplete(task.id);
                  onClose();
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-[var(--surface)] transition-opacity hover:opacity-90"
                style={{ backgroundColor: color }}
              >
                <Check className="h-4 w-4" />
                Complete
              </button>
              <button
                onClick={() => {
                  onDelete(task.id);
                  onClose();
                }}
                aria-label="Delete task"
                className="rounded-xl border border-[var(--border-subtle)] px-3.5 text-[var(--text-tertiary)] transition-colors hover:border-red-500/40 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
