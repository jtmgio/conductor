"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Calendar, Trash2, Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface ChecklistItem {
  text: string;
  done: boolean;
}

interface TagRelation {
  tag: { id: string; name: string; color: string };
}

export const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  backlog: { label: "backlog", bg: "rgba(255,255,255,0.06)", text: "var(--text-tertiary)" },
  in_progress: { label: "in progress", bg: "rgba(77,142,247,0.15)", text: "#4d8ef7" },
  in_review: { label: "in review", bg: "rgba(167,139,250,0.15)", text: "#a78bfa" },
  blocked: { label: "blocked", bg: "rgba(239,68,68,0.15)", text: "#EF4444" },
};

export const STATUS_ORDER = ["backlog", "in_progress", "in_review", "blocked"];
export const BOARD_COLUMNS = ["backlog", "in_progress"];

interface TaskItemProps {
  id: string;
  title: string;
  priority: string;
  status?: string;
  roleColor: string;
  roleName?: string;
  notes?: string | null;
  dueDate?: string | null;
  checklist?: ChecklistItem[] | null;
  tags?: TagRelation[];
  sourceType?: string | null;
  onComplete: (id: string) => void;
  onUpdate?: (id: string, data: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: string) => void;
}

function formatDueDate(dateStr: string): { label: string; overdue: boolean } {
  const due = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { label: "Overdue", overdue: true };
  if (diff === 0) return { label: "Today", overdue: false };
  if (diff === 1) return { label: "Tomorrow", overdue: false };
  return { label: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: false };
}

export function TaskItem({
  id, title, priority, status = "backlog", roleColor, roleName, notes, dueDate, checklist, tags, sourceType,
  onComplete, onUpdate, onDelete, onStatusChange,
}: TaskItemProps) {
  const [completing, setCompleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editNotes, setEditNotes] = useState(notes || "");
  const [editDueDate, setEditDueDate] = useState(dueDate ? dueDate.slice(0, 10) : "");
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>(
    Array.isArray(checklist) ? checklist : []
  );
  const [newCheckItem, setNewCheckItem] = useState("");
  const [editTags, setEditTags] = useState<string[]>(tags?.map((t) => t.tag.name) || []);
  const [newTag, setNewTag] = useState("");
  const { toast } = useToast();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && titleRef.current) titleRef.current.focus();
  }, [expanded]);

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCompleting(true);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    setTimeout(() => onComplete(id), 400);
  };

  const save = async (data: Record<string, unknown>) => {
    if (onUpdate) {
      onUpdate(id, data);
    } else {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error();
      } catch {
        toast("Failed to save", "error");
      }
    }
  };

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== title) save({ title: editTitle.trim() });
  };

  const handleSaveNotes = () => {
    if (editNotes !== (notes || "")) save({ notes: editNotes || null });
  };

  const handleSaveDueDate = (val: string) => {
    setEditDueDate(val);
    save({ dueDate: val || null });
  };

  const handleToggleCheckItem = (idx: number) => {
    const updated = editChecklist.map((item, i) =>
      i === idx ? { ...item, done: !item.done } : item
    );
    setEditChecklist(updated);
    save({ checklist: updated });
  };

  const handleAddCheckItem = () => {
    if (!newCheckItem.trim()) return;
    const updated = [...editChecklist, { text: newCheckItem.trim(), done: false }];
    setEditChecklist(updated);
    setNewCheckItem("");
    save({ checklist: updated });
  };

  const handleRemoveCheckItem = (idx: number) => {
    const updated = editChecklist.filter((_, i) => i !== idx);
    setEditChecklist(updated);
    save({ checklist: updated });
  };

  const handleDelete = async () => {
    if (onDelete) {
      onDelete(id);
    } else {
      try {
        await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      } catch {
        toast("Failed to delete", "error");
      }
    }
  };

  const dueDateInfo = dueDate ? formatDueDate(dueDate) : null;
  const checklistDone = editChecklist.filter((c) => c.done).length;

  return (
    <AnimatePresence>
      {!completing && (
        <motion.div
          layout
          initial={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 80, scale: 0.95 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--border-subtle)] transition-all duration-150"
        >
          {/* Task row */}
          <div className="flex items-center gap-3.5 px-[18px] py-[14px]">
            <button
              onClick={handleComplete}
              className="w-11 h-11 -ml-2 flex-shrink-0 flex items-center justify-center cursor-pointer"
              aria-label="Complete task"
            >
              <span
                className="w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors"
                style={{
                  borderColor: completing ? roleColor : `color-mix(in srgb, ${roleColor} 30%, transparent)`,
                  backgroundColor: completing ? `color-mix(in srgb, ${roleColor} 15%, transparent)` : "transparent",
                }}
              >
                {completing && <Check className="w-3.5 h-3.5" style={{ color: roleColor }} />}
              </span>
            </button>

            <button
              onClick={() => setExpanded(!expanded)}
              onContextMenu={(e) => { e.preventDefault(); setExpanded(!expanded); }}
              className="flex-1 min-w-0 flex flex-col gap-0.5 text-left"
            >
              {priority === "urgent" && (
                <span className="text-[13px] font-bold tracking-wide text-red-400 uppercase">URGENT</span>
              )}
              <p className="text-[17px] leading-relaxed text-[var(--text-primary)]">{title}</p>
              {/* Status + tags */}
              {!expanded && (
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onStatusChange) {
                        const nextIdx = (STATUS_ORDER.indexOf(status) + 1) % STATUS_ORDER.length;
                        onStatusChange(id, STATUS_ORDER[nextIdx]);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        if (onStatusChange) {
                          const nextIdx = (STATUS_ORDER.indexOf(status) + 1) % STATUS_ORDER.length;
                          onStatusChange(id, STATUS_ORDER[nextIdx]);
                        }
                      }
                    }}
                    className="text-[12px] font-medium px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                    style={{
                      background: STATUS_CONFIG[status]?.bg || STATUS_CONFIG.backlog.bg,
                      color: STATUS_CONFIG[status]?.text || STATUS_CONFIG.backlog.text,
                    }}
                  >
                    {STATUS_CONFIG[status]?.label || "backlog"}
                  </span>
                  {tags?.map((t) => (
                    <span
                      key={t.tag.id}
                      className="text-[12px] px-2 py-0.5 rounded-full"
                      style={{
                        background: `${t.tag.color}20`,
                        color: t.tag.color,
                      }}
                    >
                      #{t.tag.name}
                    </span>
                  ))}
                </div>
              )}
              {/* Metadata row */}
              {(dueDateInfo || editChecklist.length > 0 || notes || sourceType) && !expanded && (
                <div className="flex items-center gap-3 mt-0.5">
                  {dueDateInfo && (
                    <span className={`text-[12px] flex items-center gap-1 ${dueDateInfo.overdue ? "text-red-400 font-semibold" : "text-[var(--text-tertiary)]"}`}>
                      <Calendar className="h-3 w-3" />{dueDateInfo.label}
                    </span>
                  )}
                  {editChecklist.length > 0 && (
                    <span className="text-[12px] text-[var(--text-tertiary)]">
                      {checklistDone}/{editChecklist.length}
                    </span>
                  )}
                  {notes && <span className="text-[12px] text-[var(--text-tertiary)]">Has notes</span>}
                  {sourceType === "linear" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]" title="Synced from Linear — change status in Linear">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 2.5h11v11h-11z" stroke="currentColor" strokeWidth="1" fill="none" rx="2"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                      Linear
                    </span>
                  )}
                  {sourceType === "calendar" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                      <Calendar className="h-3 w-3" />
                      Meeting prep
                    </span>
                  )}
                </div>
              )}
            </button>

          </div>

          {/* Expanded detail panel */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-[18px] pb-4 space-y-4 border-t border-[var(--border-subtle)] pt-4">
                  {/* Title edit */}
                  <input
                    ref={titleRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-full bg-transparent text-base font-medium text-[var(--text-primary)] outline-none"
                  />

                  {/* Notes */}
                  <div>
                    <p className="text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1.5">Notes</p>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      onBlur={handleSaveNotes}
                      placeholder="Add notes..."
                      className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 resize-none min-h-[60px] placeholder:text-[var(--text-tertiary)]"
                    />
                  </div>

                  {/* Due date */}
                  <div>
                    <p className="text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1.5">Due date</p>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => handleSaveDueDate(e.target.value)}
                      className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20"
                    />
                    {editDueDate && (
                      <button onClick={() => handleSaveDueDate("")} className="ml-2 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Clear</button>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <p className="text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1.5">Status</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {STATUS_ORDER.map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            if (onStatusChange) onStatusChange(id, s);
                          }}
                          className="text-[13px] font-medium px-3 py-1 rounded-full transition-all"
                          style={{
                            background: s === status ? (STATUS_CONFIG[s]?.bg || STATUS_CONFIG.backlog.bg) : "transparent",
                            color: s === status ? (STATUS_CONFIG[s]?.text || STATUS_CONFIG.backlog.text) : "var(--text-tertiary)",
                            border: s === status ? "none" : "1px solid var(--border-subtle)",
                          }}
                        >
                          {STATUS_CONFIG[s]?.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <p className="text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1.5">Tags</p>
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {editTags.map((tagName) => {
                        const tagData = tags?.find((t) => t.tag.name === tagName);
                        const color = tagData?.tag.color || "#888780";
                        return (
                          <span key={tagName} className="inline-flex items-center gap-1 text-[13px] px-2.5 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
                            #{tagName}
                            <button
                              onClick={() => {
                                const updated = editTags.filter((t) => t !== tagName);
                                setEditTags(updated);
                                save({ tags: updated });
                              }}
                              className="hover:opacity-70"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newTag.trim()) {
                            const name = newTag.toLowerCase().trim();
                            if (!editTags.includes(name)) {
                              const updated = [...editTags, name];
                              setEditTags(updated);
                              save({ tags: updated });
                            }
                            setNewTag("");
                          }
                        }}
                        placeholder="Add tag..."
                        className="flex-1 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 placeholder:text-[var(--text-tertiary)]"
                      />
                    </div>
                  </div>

                  {/* Checklist */}
                  <div>
                    <p className="text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1.5">
                      Checklist {editChecklist.length > 0 && `(${checklistDone}/${editChecklist.length})`}
                    </p>
                    <div className="space-y-1">
                      {editChecklist.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 group">
                          <button onClick={() => handleToggleCheckItem(i)} className="w-5 h-5 rounded border border-[var(--border-default)] flex items-center justify-center shrink-0">
                            {item.done && <Check className="w-3 h-3 text-[var(--text-secondary)]" />}
                          </button>
                          <span className={`flex-1 text-[14px] ${item.done ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
                            {item.text}
                          </span>
                          <button onClick={() => handleRemoveCheckItem(i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Plus className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                      <input
                        value={newCheckItem}
                        onChange={(e) => setNewCheckItem(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddCheckItem()}
                        placeholder="Add item..."
                        className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      {roleName && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: `${roleColor}1a`, color: roleColor }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: roleColor }} />{roleName}
                        </span>
                      )}
                    </div>
                    <button onClick={handleDelete} className="flex items-center gap-1 text-[13px] text-[var(--text-tertiary)] hover:text-red-400 transition-colors min-h-[44px]">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
