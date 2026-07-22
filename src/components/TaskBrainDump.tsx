"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, X, Plus, Check } from "lucide-react";
import { useTaskRefine, type RefinedTask } from "@/hooks/useTaskRefine";
import { useToast } from "@/components/ui/toast";
import { parseScheduleTag } from "@/lib/dates";

interface TaskBrainDumpProps {
  roleId: string;
  roleName?: string;
  roleColor?: string;
  scheduledFor?: string | null;
  /** Called when an inline @schedule tag was parsed out of the input. */
  onScheduleParsed?: (iso: string) => void;
  onTaskCreated: () => void;
  onCancel: () => void;
  compact?: boolean;
}

export function TaskBrainDump({ roleId, roleName, roleColor, scheduledFor = null, onScheduleParsed, onTaskCreated, onCancel, compact = false }: TaskBrainDumpProps) {
  const { state, refined, refine, updateField, reset } = useTaskRefine();
  const [inputText, setInputText] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();

  // Auto-focus textarea on mount and when returning to idle
  useEffect(() => {
    if (state === "idle") {
      // Small delay to let AnimatePresence finish
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Focus create button when preview appears
  useEffect(() => {
    if (state === "preview") {
      const t = setTimeout(() => createBtnRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [state]);

  const handleSubmit = () => {
    let text = inputText.trim();
    if (!text) return;
    const tag = parseScheduleTag(text);
    if (tag) {
      text = text.replace(tag.match, "").replace(/\s{2,}/g, " ").trim();
      if (onScheduleParsed) onScheduleParsed(tag.iso);
    }
    if (!text) return;
    refine(text, roleId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      if (state === "preview") {
        reset();
        setInputText("");
      } else {
        onCancel();
      }
    }
  };

  const handlePreviewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      reset();
      setInputText("");
    }
  };

  const createTask = async () => {
    if (!refined) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId,
          title: refined.title,
          notes: refined.notes || undefined,
          checklist: refined.checklist || undefined,
          priority: refined.priority,
          scheduledFor,
          dueDate: refined.dueDate || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast("Task added", "success");
      reset();
      setInputText("");
      onTaskCreated();
    } catch {
      toast("Failed to add task", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeChecklistItem = (idx: number) => {
    if (!refined?.checklist) return;
    const next = refined.checklist.filter((_, i) => i !== idx);
    updateField("checklist", next.length > 0 ? next : null);
  };

  const addChecklistItem = () => {
    if (!refined) return;
    const next = [...(refined.checklist || []), { text: "", done: false }];
    updateField("checklist", next);
  };

  const updateChecklistText = (idx: number, text: string) => {
    if (!refined?.checklist) return;
    const next = refined.checklist.map((item, i) => i === idx ? { ...item, text } : item);
    updateField("checklist", next);
  };

  return (
    <div onKeyDown={handlePreviewKeyDown}>
      <AnimatePresence mode="wait">
        {/* Input state */}
        {state === "idle" && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0 }}
          >
            <textarea
              ref={textareaRef}
              tabIndex={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What do you need to do? Just dump your thoughts… add @today, @tomorrow, @thu, or @5/15 to schedule"
              rows={compact ? 2 : 3}
              className="w-full bg-transparent border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-[var(--text-tertiary)]">
                Enter to refine with AI
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="px-3 py-1.5 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Refining state */}
        {state === "refining" && (
          <motion.div
            key="refining"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-3 py-8"
          >
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-blue)]" />
            <span className="text-[14px] text-[var(--text-tertiary)]">Refining your task...</span>
          </motion.div>
        )}

        {/* Preview state */}
        {state === "preview" && refined && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            {/* Title */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1 block">Title</label>
              <input
                ref={titleRef}
                tabIndex={1}
                value={refined.title}
                onChange={(e) => updateField("title", e.target.value)}
                className="w-full bg-transparent border border-[var(--accent-blue)]/30 rounded-lg px-3 py-2 text-[15px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>

            {/* Notes */}
            {refined.notes && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1 block">Notes</label>
                <textarea
                  tabIndex={2}
                  value={refined.notes}
                  onChange={(e) => updateField("notes", e.target.value || null)}
                  rows={Math.min(6, Math.max(3, (refined.notes || "").split("\n").length + 1))}
                  className="w-full bg-transparent border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-blue)] resize-y"
                />
              </div>
            )}

            {/* Checklist */}
            {refined.checklist && refined.checklist.length > 0 && (
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1 block">Checklist</label>
                <div className="space-y-1">
                  {refined.checklist.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
                      <input
                        tabIndex={-1}
                        value={item.text}
                        onChange={(e) => updateChecklistText(i, e.target.value)}
                        className="flex-1 bg-transparent border-b border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] py-1 focus:outline-none focus:border-[var(--accent-blue)] cursor-text"
                      />
                      <button onClick={() => removeChecklistItem(i)} className="text-[var(--text-tertiary)] hover:text-red-400">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addChecklistItem}
                    className="flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] mt-1"
                  >
                    <Plus className="h-3 w-3" /> Add step
                  </button>
                </div>
              </div>
            )}

            {/* Priority + Due date row */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Priority</label>
                <button
                  tabIndex={3}
                  onClick={() => updateField("priority", refined.priority === "urgent" ? "normal" : "urgent")}
                  className={`text-[12px] font-medium px-2.5 py-0.5 rounded-full transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]/30 outline-none ${
                    refined.priority === "urgent"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-white/5 text-[var(--text-tertiary)]"
                  }`}
                >
                  {refined.priority}
                </button>
              </div>
              {refined.dueDate ? (
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Due</label>
                  <input
                    tabIndex={4}
                    type="date"
                    value={refined.dueDate}
                    onChange={(e) => updateField("dueDate", e.target.value || null)}
                    className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-0.5 text-[12px] text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/30"
                  />
                  <button onClick={() => updateField("dueDate", null)} className="text-[var(--text-tertiary)] hover:text-red-400">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  tabIndex={4}
                  onClick={() => updateField("dueDate", new Date().toISOString().split("T")[0])}
                  className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]/30 outline-none rounded px-2 py-0.5"
                >
                  + Add due date
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
              <button
                tabIndex={7}
                onClick={() => { reset(); setInputText(""); }}
                className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]/30 outline-none rounded px-2 py-1"
              >
                Discard
              </button>
              <div className="flex items-center gap-2">
                <button
                  tabIndex={6}
                  onClick={() => { reset(); }}
                  className="px-3 py-1.5 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]/30 outline-none rounded-lg"
                >
                  Re-edit
                </button>
                <button
                  ref={createBtnRef}
                  tabIndex={5}
                  onClick={createTask}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createTask(); } }}
                  disabled={saving || !refined.title.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 focus:ring-2 focus:ring-[var(--accent-blue)]/50 outline-none"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Create task
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
