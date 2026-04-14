"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Trash2, Plus, X, Pencil, ExternalLink, Sparkles, ListChecks, Paperclip, FileText, Image, File, Download, Loader2 } from "lucide-react";
import { STATUS_CONFIG, STATUS_ORDER } from "./TaskItem";
import { ChatThread } from "./ChatThread";
import { FontSizeControl } from "./FontSizeControl";
import { useTaskChat } from "@/hooks/useTaskChat";
import { useFontSize } from "@/hooks/useFontSize";
import { useToast } from "@/components/ui/toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface TagRelation {
  tag: { id: string; name: string; color: string };
}

interface ChecklistItem {
  text: string;
  done: boolean;
}

interface TaskAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface DrawerTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  roleId: string;
  notes?: string | null;
  dueDate?: string | null;
  checklist?: ChecklistItem[] | null;
  tags?: TagRelation[];
  role: { id: string; name: string; color: string };
}

interface TaskDetailDrawerProps {
  task: DrawerTask | null;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onStatusChange: (id: string, status: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-purple-400" />;
  if (mimeType.includes("pdf")) return <FileText className="h-4 w-4 text-red-400" />;
  if (mimeType.includes("word") || mimeType.includes("document")) return <FileText className="h-4 w-4 text-blue-400" />;
  return <File className="h-4 w-4 text-[var(--text-tertiary)]" />;
}

export function TaskDetailDrawer({ task, onClose, onUpdate, onStatusChange, onComplete, onDelete }: TaskDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"details" | "chat">("details");
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>([]);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Attachments state
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const font = useFontSize("task-drawer");

  const { messages, loading: chatLoading, sending, sendMessage, clearConversation } = useTaskChat(
    task?.id || null,
    task?.roleId || "",
    task?.title || ""
  );

  // Load attachments
  const loadAttachments = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/files`);
      if (res.ok) setAttachments(await res.json());
    } catch {}
  }, []);

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditNotes(task.notes || "");
      setEditDueDate(task.dueDate ? task.dueDate.slice(0, 10) : "");
      setEditChecklist(Array.isArray(task.checklist) ? task.checklist : []);
      setEditTags(task.tags?.map((t) => t.tag.name) || []);
      setNewCheckItem("");
      setEditingNotes(false);
      setNewTag("");
      setActiveTab("details");
      setAttachments([]);
      loadAttachments(task.id);
    }
  }, [task?.id, loadAttachments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!task) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [task, onClose]);

  const save = (data: Record<string, unknown>) => {
    if (task) onUpdate(task.id, data);
  };

  // File upload handler
  const uploadFile = useCallback(async (file: globalThis.File) => {
    if (!task) return;
    if (file.size > 10 * 1024 * 1024) {
      toast("File exceeds 10MB limit", "error");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/tasks/${task.id}/files`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const uploaded = await res.json();
        setAttachments((prev) => [uploaded, ...prev]);
        toast("File attached", "success");
      } else {
        toast("Failed to upload file", "error");
      }
    } catch {
      toast("Failed to upload file", "error");
    }
    setUploading(false);
  }, [task, toast]);

  const removeFile = useCallback(async (fileId: string) => {
    if (!task) return;
    try {
      await fetch(`/api/tasks/${task.id}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      setAttachments((prev) => prev.filter((f) => f.id !== fileId));
    } catch {}
  }, [task]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  if (!task) return null;

  const borderColor = STATUS_CONFIG[task.status]?.text || "var(--border-subtle)";

  return (
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] bg-black/50"
            onClick={onClose}
          />
          {/* Drawer panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[70] w-full md:w-3/4 bg-[var(--surface)] border-l border-[var(--border-subtle)] flex flex-col"
            style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
          >
            {/* Header — always visible */}
            <div className="p-6 pb-0 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: task.role.color }} />
                    <span className="text-[13px] font-medium" style={{ color: task.role.color }}>{task.role.name}</span>
                    {task.priority === "urgent" && (
                      <span className="text-[11px] font-bold tracking-wide text-red-400 uppercase ml-1">URGENT</span>
                    )}
                  </div>
                  <input
                    ref={titleRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => { if (editTitle.trim() && editTitle !== task.title) save({ title: editTitle.trim() }); }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-full bg-transparent text-[20px] font-semibold text-[var(--text-primary)] outline-none"
                  />
                </div>
                <button onClick={onClose} className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tab bar */}
              <div className="flex gap-2 mt-4 mb-0">
                <button
                  onClick={() => setActiveTab("details")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                    activeTab === "details"
                      ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  Details
                </button>
                <button
                  onClick={() => setActiveTab("chat")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                    activeTab === "chat"
                      ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Chat
                  {messages.length > 0 && (
                    <span className="text-[11px] text-[var(--text-tertiary)]">({messages.length})</span>
                  )}
                </button>
                <div className="flex-1" />
                <FontSizeControl size={font.size} onIncrease={font.increase} onDecrease={font.decrease} atMin={font.atMin} atMax={font.atMax} />
              </div>
            </div>

            {/* Tab content */}
            {activeTab === "details" ? (
              <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-5">
                {/* Status */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Status</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {STATUS_ORDER.map((s) => (
                      <button
                        key={s}
                        onClick={() => onStatusChange(task.id, s)}
                        className="text-[13px] font-medium px-3 py-1 rounded-full transition-all"
                        style={{
                          background: s === task.status ? (STATUS_CONFIG[s]?.bg) : "transparent",
                          color: s === task.status ? (STATUS_CONFIG[s]?.text) : "var(--text-tertiary)",
                          border: s === task.status ? "none" : "1px solid var(--border-subtle)",
                        }}
                      >
                        {STATUS_CONFIG[s]?.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Notes</p>
                    {editNotes && (
                      <button
                        onClick={() => {
                          if (editingNotes) {
                            if (editNotes !== (task.notes || "")) save({ notes: editNotes || null });
                          } else {
                            setTimeout(() => notesRef.current?.focus(), 0);
                          }
                          setEditingNotes(!editingNotes);
                        }}
                        className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] flex items-center gap-1 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        {editingNotes ? "Done" : "Edit"}
                      </button>
                    )}
                  </div>
                  {editingNotes || !editNotes ? (
                    <textarea
                      ref={notesRef}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      onBlur={() => { if (editNotes !== (task.notes || "")) save({ notes: editNotes || null }); }}
                      placeholder="Add notes..."
                      rows={4}
                      className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 resize-y min-h-[100px] placeholder:text-[var(--text-tertiary)]"
                    />
                  ) : (
                    <div
                      onClick={() => { setEditingNotes(true); setTimeout(() => notesRef.current?.focus(), 0); }}
                      className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 cursor-text prose prose-invert prose-sm max-w-none
                        prose-p:text-[var(--text-primary)] prose-p:text-[15px] prose-p:leading-relaxed prose-p:my-1.5
                        prose-a:text-[var(--accent-blue)] prose-a:no-underline hover:prose-a:underline
                        prose-img:rounded-lg prose-img:max-h-[300px] prose-img:w-auto
                        prose-headings:text-[var(--text-primary)] prose-headings:font-semibold
                        prose-strong:text-[var(--text-primary)]
                        prose-code:text-[var(--accent-blue)] prose-code:bg-[var(--surface)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px]
                        prose-li:text-[var(--text-primary)] prose-li:text-[15px]
                        prose-ul:my-1.5 prose-ol:my-1.5"
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1">
                              {children}
                              <ExternalLink className="w-3 h-3 inline shrink-0" />
                            </a>
                          ),
                        }}
                      >
                        {editNotes}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {/* Attachments */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">
                    Attachments {attachments.length > 0 && `(${attachments.length})`}
                  </p>

                  {/* File list */}
                  {attachments.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {attachments.map((file) => (
                        <div key={file.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--surface-raised)] group">
                          <FileIcon mimeType={file.mimeType} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] text-[var(--text-primary)] truncate">{file.filename}</p>
                            <p className="text-[11px] text-[var(--text-tertiary)]">{formatFileSize(file.size)}</p>
                          </div>
                          <a
                            href={`/api/documents/download?fileId=${file.id}`}
                            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] hover:bg-[var(--sidebar-hover)] transition-colors opacity-0 group-hover:opacity-100"
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                          <button
                            onClick={() => removeFile(file.id)}
                            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-400 hover:bg-[var(--sidebar-hover)] transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Drop zone / upload button */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                      dragOver
                        ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
                        : "border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
                    }`}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                    ) : (
                      <Paperclip className="h-4 w-4 text-[var(--text-tertiary)]" />
                    )}
                    <span className="text-[13px] text-[var(--text-tertiary)]">
                      {uploading ? "Uploading..." : "Drop file or click to attach"}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.pptx,.ppt,.zip"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadFile(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>

                {/* Due date */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Due date</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => { setEditDueDate(e.target.value); save({ dueDate: e.target.value || null }); }}
                      className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20"
                    />
                    {editDueDate && (
                      <button onClick={() => { setEditDueDate(""); save({ dueDate: null }); }} className="text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Clear</button>
                    )}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Tags</p>
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {editTags.map((tagName) => {
                      const tagData = task.tags?.find((t) => t.tag.name === tagName);
                      const color = tagData?.tag.color || "#888780";
                      return (
                        <span key={tagName} className="inline-flex items-center gap-1 text-[13px] px-2.5 py-1 rounded-full" style={{ background: `${color}20`, color }}>
                          #{tagName}
                          <button onClick={() => { const updated = editTags.filter((t) => t !== tagName); setEditTags(updated); save({ tags: updated }); }}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
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
                    className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 placeholder:text-[var(--text-tertiary)]"
                  />
                </div>

                {/* Checklist */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">
                    Checklist {editChecklist.length > 0 && `(${editChecklist.filter((c) => c.done).length}/${editChecklist.length})`}
                  </p>
                  <div className="space-y-1.5">
                    {editChecklist.map((item, i) => (
                      <div key={i} className="flex items-center gap-2.5 group">
                        <button onClick={() => { const updated = editChecklist.map((c, j) => j === i ? { ...c, done: !c.done } : c); setEditChecklist(updated); save({ checklist: updated }); }} className="w-5 h-5 rounded-md border-2 border-[var(--border-default)] flex items-center justify-center shrink-0">
                          {item.done && <Check className="w-3 h-3 text-[var(--text-secondary)]" />}
                        </button>
                        <span className={`flex-1 text-[14px] ${item.done ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>{item.text}</span>
                        <button onClick={() => { const updated = editChecklist.filter((_, j) => j !== i); setEditChecklist(updated); save({ checklist: updated }); }} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2.5 mt-2">
                    <Plus className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                    <input
                      value={newCheckItem}
                      onChange={(e) => setNewCheckItem(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && newCheckItem.trim()) { const updated = [...editChecklist, { text: newCheckItem.trim(), done: false }]; setEditChecklist(updated); setNewCheckItem(""); save({ checklist: updated }); } }}
                      placeholder="Add item..."
                      className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-3 border-t border-[var(--border-subtle)]">
                  <button
                    onClick={() => { onComplete(task.id); onClose(); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 text-green-400 text-[14px] font-medium hover:bg-green-500/20 transition-colors"
                  >
                    <Check className="w-4 h-4" /> Complete
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => { onDelete(task.id); onClose(); }}
                    className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)] hover:text-red-400 transition-colors min-h-[44px]"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </div>
            ) : (
              /* AI Chat tab */
              <div className="flex-1 min-h-0 flex flex-col">
                <ChatThread
                  roleId={task.roleId}
                  roleName={task.role.name}
                  roleColor={task.role.color}
                  messages={messages}
                  onSendMessage={sendMessage}
                  onClearConversation={clearConversation}
                  loading={chatLoading || sending}
                  threadName={task.title}
                  fontSize={font.size}
                />
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
