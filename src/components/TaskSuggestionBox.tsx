"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Wand2, Loader2, AlertTriangle, Copy, FileEdit, HelpCircle, Check } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { TaskSuggestion } from "@/hooks/useTaskSuggestion";

interface TaskSuggestionBoxProps {
  suggestion: TaskSuggestion;
  onDismiss: () => void;
  onApply: (taskId: string, data: Record<string, unknown>) => Promise<void>;
}

export function TaskSuggestionBox({ suggestion, onDismiss, onApply }: TaskSuggestionBoxProps) {
  const { toast } = useToast();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden"
      >
        <div className="border border-[var(--border-subtle)] rounded-xl bg-[var(--surface)] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5 text-[var(--accent-blue)]" />
              <span className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">AI Review</span>
            </div>
            <button onClick={onDismiss} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {suggestion.loading ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" />
              <span className="text-[13px] text-[var(--text-tertiary)]">Reviewing &ldquo;{suggestion.taskTitle}&rdquo;...</span>
            </div>
          ) : suggestion.data && (
            <div className="space-y-2">
              {!!suggestion.data.duplicate && (
                <div className="flex items-start gap-2">
                  <Copy className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Similar to: <span className="text-[var(--text-primary)] font-medium">{String(suggestion.data.duplicate)}</span>
                  </p>
                </div>
              )}

              {!!suggestion.data.rewrite && (
                <div className="flex items-start gap-2">
                  <FileEdit className="h-3.5 w-3.5 text-[var(--accent-blue)] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[var(--text-secondary)]">{String(suggestion.data.rewrite)}</p>
                    <button
                      onClick={() => {
                        onApply(suggestion.taskId, { title: suggestion.data!.rewrite });
                        onDismiss();
                        toast("Title updated", "success");
                      }}
                      tabIndex={6}
                      className="text-[12px] text-[var(--accent-blue)] hover:underline mt-0.5 outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 rounded px-1"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}

              {suggestion.data.priority === "urgent" && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[var(--text-secondary)]">This sounds time-sensitive</p>
                    <button
                      onClick={() => {
                        onApply(suggestion.taskId, { priority: "urgent" });
                        onDismiss();
                        toast("Marked urgent", "success");
                      }}
                      tabIndex={6}
                      className="text-[12px] text-[var(--accent-blue)] hover:underline mt-0.5 outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 rounded px-1"
                    >
                      Mark urgent
                    </button>
                  </div>
                </div>
              )}

              {Array.isArray(suggestion.data.subtasks) && (suggestion.data.subtasks as string[]).length > 0 && (
                <div className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[var(--text-secondary)] mb-1">Break into checklist:</p>
                    <ul className="space-y-0.5">
                      {(suggestion.data.subtasks as string[]).map((s, i) => (
                        <li key={i} className="text-[13px] text-[var(--text-primary)] flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => {
                        const checklist = (suggestion.data!.subtasks as string[]).map((text) => ({ text, done: false }));
                        onApply(suggestion.taskId, { checklist });
                        onDismiss();
                        toast("Checklist added", "success");
                      }}
                      tabIndex={6}
                      className="text-[12px] text-[var(--accent-blue)] hover:underline mt-1 outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 rounded px-1"
                    >
                      Add checklist
                    </button>
                  </div>
                </div>
              )}

              {!!suggestion.data.clarify && (
                <div className="flex items-start gap-2">
                  <HelpCircle className="h-3.5 w-3.5 text-[var(--text-tertiary)] mt-0.5 shrink-0" />
                  <p className="text-[13px] text-[var(--text-secondary)]">{String(suggestion.data.clarify)}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
