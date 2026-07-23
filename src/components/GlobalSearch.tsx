"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, CheckSquare, Clock, FileText, MessageSquare, Sparkles, Loader2, RefreshCw, Calendar, Mic, Link2, Plus, PenLine, Copy, Check, Crosshair, Columns3, ListChecks, Settings, Moon } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTaskSuggestion } from "@/hooks/useTaskSuggestion";
import { TaskSuggestionBox } from "@/components/TaskSuggestionBox";
import { TaskBrainDump } from "@/components/TaskBrainDump";
import { useFormatMessage } from "@/hooks/useFormatMessage";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { todayISO, tomorrowISO, parseDateOnly, formatDateOnly, nextWorkingDay } from "@/lib/dates";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SearchResult {
  tasks: Array<{ id: string; title: string; priority: string; dueDate?: string; role: { id: string; name: string; color: string } }>;
  followUps: Array<{ id: string; title: string; waitingOn: string; role: { id: string; name: string; color: string } }>;
  notes: Array<{ id: string; content: string; createdAt: string; role: { id: string; name: string; color: string } }>;
  transcripts: Array<{ id: string; preview: string; createdAt: string; role: { id: string; name: string; color: string } }>;
}

// Slack mrkdwn → standard markdown, for the preview only. The API emits real
// Slack syntax (*bold*, _italic_, ~strike~), but ReactMarkdown reads *x* as
// italic — and Copy grabs the rendered preview HTML, so a misrender here would
// paste wrong into Slack too. Code spans/blocks are left untouched.
function mrkdwnToMarkdown(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((seg) => {
      if (seg.startsWith("`")) return seg;
      return seg
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/gm, "$1**$2**")
        .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/gm, "$1*$2*")
        .replace(/(^|[\s(])~([^~\n]+)~(?=[\s.,;:!?)]|$)/gm, "$1~~$2~~");
    })
    .join("");
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string[];
  action: () => Promise<void>;
}

export function GlobalSearch({ hideTrigger = false }: { hideTrigger?: boolean } = {}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [addTaskMode, setAddTaskMode] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskRoleId, setNewTaskRoleId] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"normal" | "urgent">("normal");
  const [newTaskIsToday, setNewTaskIsToday] = useState(false);
  const [newTaskScheduledFor, setNewTaskScheduledFor] = useState<string | null>(null);
  const [roles, setRoles] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [formatMessageMode, setFormatMessageMode] = useState(false);
  const [formatRoleId, setFormatRoleId] = useState("");
  const [formatType, setFormatType] = useState<"slack" | "teams" | "email" | "sms">("slack");
  const [formatInput, setFormatInput] = useState("");
  const fmtHook = useFormatMessage();
  const formatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const formatCopyRef = useRef<HTMLButtonElement>(null);
  const formatPreviewRef = useRef<HTMLDivElement>(null);
  const formatRoleSelectRef = useRef<HTMLSelectElement>(null);
  const { suggestion, setSuggestion, requestSuggestion, applyTaskSuggestion } = useTaskSuggestion();
  const inputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const roleSelectRef = useRef<HTMLSelectElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Auto-focus copy button when format preview appears
  useEffect(() => {
    if (fmtHook.state === "preview") {
      setTimeout(() => formatCopyRef.current?.focus(), 50);
    }
  }, [fmtHook.state]);

  // Fetch roles for task creation
  useEffect(() => {
    fetch("/api/roles").then((r) => r.json()).then((data) => {
      const arr = Array.isArray(data) ? data : [];
      setRoles(arr);
      if (arr.length > 0 && !newTaskRoleId) setNewTaskRoleId(arr[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSync = useCallback(async (type: string, redirectTo: string) => {
    setActionRunning(type);
    try {
      const res = await fetch(`/api/integrations/${type}/sync`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const count = data.processed || 0;
        toast(count > 0 ? `Synced ${count} new item${count !== 1 ? "s" : ""}` : "Already up to date", "success");
        setOpen(false);
        if (count > 0) router.push(redirectTo);
      } else {
        toast(data.error || "Sync failed", "error");
        setOpen(false);
      }
    } catch {
      toast("Sync failed — check your connection", "error");
      setOpen(false);
    }
    setActionRunning(null);
  }, [router, toast]);

  const quickActions: QuickAction[] = [
    {
      id: "format-message",
      label: "Format message",
      description: "Rewrite in your tone for Slack, Teams, or email",
      icon: PenLine,
      keywords: ["format", "tone", "rewrite", "message", "draft", "slack", "teams", "email"],
      action: async () => {
        setFormatMessageMode(true);
        setFormatRoleId(roles[0]?.id || "");
        setTimeout(() => formatRoleSelectRef.current?.focus(), 100);
      },
    },
    {
      id: "add-task",
      label: "Add task",
      description: "Create a new task",
      icon: Plus,
      keywords: ["add", "task", "new", "create"],
      action: async () => {
        setAddTaskMode(true);
        setTimeout(() => roleSelectRef.current?.focus(), 100);
      },
    },
    {
      id: "plan-tomorrow",
      label: "Plan tomorrow",
      description: "Line up tomorrow's tasks",
      icon: Moon,
      keywords: ["plan", "tomorrow", "next day", "schedule", "prep"],
      action: async () => { setOpen(false); router.push("/plan"); },
    },
    {
      id: "go-today",
      label: "Go to Today",
      description: "Your one-thing cockpit",
      icon: Crosshair,
      keywords: ["today", "focus", "home", "now"],
      action: async () => { setOpen(false); router.push("/"); },
    },
    {
      id: "go-board",
      label: "Go to Board",
      description: "All tasks by status",
      icon: Columns3,
      keywords: ["board", "kanban", "tasks", "backlog"],
      action: async () => { setOpen(false); router.push("/board"); },
    },
    {
      id: "go-formatter",
      label: "Go to Formatter",
      description: "Rewrite a draft in your voice",
      icon: PenLine,
      keywords: ["formatter", "format", "message", "draft", "rewrite"],
      action: async () => { setOpen(false); router.push("/formatter"); },
    },
    {
      id: "go-tracker",
      label: "Go to Tracker",
      description: "Things you're waiting on",
      icon: ListChecks,
      keywords: ["tracker", "follow", "waiting", "followup"],
      action: async () => { setOpen(false); router.push("/tracker"); },
    },
    {
      id: "go-settings",
      label: "Go to Settings",
      description: "Roles, integrations, reminders",
      icon: Settings,
      keywords: ["settings", "config", "integrations", "reminders"],
      action: async () => { setOpen(false); router.push("/settings"); },
    },
  ];

  const submitTask = async () => {
    if (!newTaskTitle.trim() || !newTaskRoleId) return;
    const taskTitle = newTaskTitle.trim();
    const roleId = newTaskRoleId;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId,
          title: taskTitle,
          priority: newTaskPriority,
          scheduledFor: newTaskIsToday ? todayISO() : null,
          status: "backlog",
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      toast("Task added", "success");
      setNewTaskTitle("");
      setNewTaskPriority("normal");
      setNewTaskIsToday(false);
      window.dispatchEvent(new CustomEvent("tasks-changed"));
      setTimeout(() => taskInputRef.current?.focus(), 50);

      // Fire AI suggestion in background
      requestSuggestion(created.id, taskTitle, roleId);
    } catch {
      toast("Failed to add task", "error");
    }
  };

  const totalResults = results
    ? results.tasks.length + results.followUps.length
    : 0;

  const filteredActions = query.trim()
    ? quickActions.filter((a) => {
        const q = query.toLowerCase();
        return a.keywords.some((k) => k.includes(q)) || a.label.toLowerCase().includes(q);
      })
    : quickActions;

  // Build flat list of selectable items for keyboard nav
  const showActions = filteredActions.length > 0 && (!query || (query && totalResults === 0));
  const selectableItems: Array<{ type: "action"; action: QuickAction } | { type: "result"; category: string; idx: number }> = [];
  if (showActions) {
    for (const a of filteredActions) selectableItems.push({ type: "action", action: a });
  }
  if (results && totalResults > 0) {
    for (let i = 0; i < results.tasks.length; i++) selectableItems.push({ type: "result", category: "tasks", idx: i });
    for (let i = 0; i < results.followUps.length; i++) selectableItems.push({ type: "result", category: "followUps", idx: i });
  }

  // Reset selection when items change
  useEffect(() => { setSelectedIdx(0); }, [query, totalResults]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, selectableItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectableItems.length > 0) {
      e.preventDefault();
      const item = selectableItems[selectedIdx];
      if (item?.type === "action") {
        item.action.action();
      } else if (item?.type === "result") {
        setOpen(false);
      }
    }
  };

  const askAI = async () => {
    if (!query.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/search/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (data.answer) setAiAnswer(data.answer);
    } catch {}
    setAiLoading(false);
  };

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) { setOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
    if (!open) { setQuery(""); setResults(null); setAiAnswer(null); setAddTaskMode(false); setNewTaskTitle(""); setNewTaskScheduledFor(null); setFormatMessageMode(false); fmtHook.reset(); setFormatInput(""); setFormatRoleId(""); setFormatType("slack"); }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  // totalResults moved earlier in the component — see above

  return (
    <>
      {/* Trigger button for sidebar */}
      {!hideTrigger && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 py-2.5 px-4 rounded-lg w-full text-[var(--sidebar-text)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)] transition-all duration-200 border-l-2 border-transparent"
        >
          <Search className="h-[18px] w-[18px] opacity-60" />
          <span className="text-[15px]">Search</span>
          <kbd className="ml-auto text-[11px] text-[var(--text-tertiary)] bg-[var(--surface)] px-1.5 py-0.5 rounded hidden lg:inline">⌘K</kbd>
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-black/50"
            />
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="fixed top-[10%] left-4 right-4 z-[60] mx-auto max-w-[560px] bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden"
            >
              {formatMessageMode ? (
                /* ── Format Message Mode ── */
                <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Format message</h3>
                    <button onClick={() => { setFormatMessageMode(false); fmtHook.reset(); setFormatInput(""); }} className="text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Back to search</button>
                  </div>

                  {/* Role select */}
                  <select
                    ref={formatRoleSelectRef}
                    tabIndex={1}
                    value={formatRoleId}
                    onChange={(e) => setFormatRoleId(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setFormatMessageMode(false); fmtHook.reset(); } }}
                    className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 appearance-none cursor-pointer"
                    style={formatRoleId ? { borderColor: roles.find(r => r.id === formatRoleId)?.color } : undefined}
                  >
                    <option value="">Select role...</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>

                  {/* Format type picker */}
                  <div className="flex gap-1.5">
                    {(["slack", "teams", "email", "sms"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        tabIndex={2}
                        onClick={() => setFormatType(fmt)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFormatType(fmt); } }}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]/30 outline-none ${
                          formatType === fmt
                            ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]"
                            : "bg-[var(--surface)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                        }`}
                      >
                        {fmt.charAt(0).toUpperCase() + fmt.slice(1)}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {/* Input state */}
                    {fmtHook.state === "idle" && (
                      <motion.div key="fmt-input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <textarea
                          ref={formatTextareaRef}
                          tabIndex={3}
                          value={formatInput}
                          onChange={(e) => setFormatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (formatInput.trim() && formatRoleId) fmtHook.formatMessage(formatInput.trim(), formatRoleId, formatType);
                            }
                            if (e.key === "Escape") { setOpen(false); setFormatMessageMode(false); }
                          }}
                          placeholder="Paste your raw message here..."
                          rows={5}
                          className="w-full bg-transparent border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-blue)] resize-none"
                        />
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">Enter to format. Shift+Enter for new line.</p>
                      </motion.div>
                    )}

                    {/* Formatting state */}
                    {fmtHook.state === "formatting" && (
                      <motion.div key="fmt-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-3 py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--accent-blue)]" />
                        <span className="text-[14px] text-[var(--text-tertiary)]">Formatting in your tone...</span>
                      </motion.div>
                    )}

                    {/* Preview state */}
                    {fmtHook.state === "preview" && fmtHook.formatted && (
                      <motion.div key="fmt-preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                        {/* Actions — pinned above the preview so long messages don't hide them */}
                        <div className="flex items-center justify-between">
                          <button
                            tabIndex={3}
                            onClick={() => { fmtHook.reset(); }}
                            className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors focus:ring-2 focus:ring-[var(--accent-blue)]/30 outline-none rounded px-2 py-1"
                          >
                            Format again
                          </button>
                          <button
                            ref={formatCopyRef}
                            tabIndex={1}
                            onClick={() => fmtHook.copyToClipboard(formatPreviewRef.current)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fmtHook.copyToClipboard(formatPreviewRef.current); } }}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all focus:ring-2 focus:ring-[var(--accent-blue)]/50 outline-none ${
                              fmtHook.copied
                                ? "bg-green-500/15 text-green-400"
                                : "bg-[var(--accent-blue)] text-white hover:opacity-90"
                            }`}
                          >
                            {fmtHook.copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {fmtHook.copied ? "Copied!" : "Copy"}
                          </button>
                        </div>

                        <div ref={formatPreviewRef} className="border border-[var(--border-subtle)] rounded-xl bg-[var(--surface)] p-4 text-[14px] text-[var(--text-primary)] leading-relaxed [&_p]:mb-2 [&_strong]:font-semibold [&_em]:italic [&_ul]:pl-5 [&_ul]:list-disc [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:mb-1 [&_h3]:font-semibold [&_h3]:text-[15px] [&_h3]:mb-2 [&_h4]:font-semibold [&_h4]:text-[14px] [&_h4]:mb-1 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border-subtle)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--text-secondary)] [&_code]:bg-white/5 [&_code]:px-1 [&_code]:rounded [&_code]:text-[13px]">
                          {fmtHook.format === "email" ? (
                            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(fmtHook.formatted) }} />
                          ) : fmtHook.format === "sms" ? (
                            <pre className="whitespace-pre-wrap font-sans">{fmtHook.formatted}</pre>
                          ) : (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {fmtHook.format === "slack" ? mrkdwnToMarkdown(fmtHook.formatted) : fmtHook.formatted}
                            </ReactMarkdown>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : addTaskMode ? (
                /* ── Add Task Mode ── */
                <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Add task</h3>
                    <button onClick={() => setAddTaskMode(false)} className="text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Back to search</button>
                  </div>

                  {/* Role select — tab index 1, auto-focused */}
                  <select
                    ref={roleSelectRef}
                    tabIndex={1}
                    value={newTaskRoleId}
                    onChange={(e) => setNewTaskRoleId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { e.preventDefault(); setOpen(false); setAddTaskMode(false); }
                    }}
                    className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[15px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 appearance-none cursor-pointer"
                    style={newTaskRoleId ? { borderColor: roles.find(r => r.id === newTaskRoleId)?.color } : undefined}
                  >
                    <option value="">Select role...</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>

                  {/* Schedule chips */}
                  {newTaskRoleId && (() => {
                    const today = todayISO();
                    const tomorrow = tomorrowISO();
                    const nwdDate = formatDateOnly(nextWorkingDay(parseDateOnly(today)!))!;
                    const nwdLabel = parseDateOnly(nwdDate)!.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
                    const showNwdChip = nwdDate !== tomorrow;
                    const options: Array<{ label: string; value: string | null }> = [
                      { label: "Backlog", value: null },
                      { label: "Today", value: today },
                      { label: "Tomorrow", value: tomorrow },
                    ];
                    if (showNwdChip) options.push({ label: nwdLabel, value: nwdDate });
                    const isPreset = newTaskScheduledFor === null || options.some((o) => o.value === newTaskScheduledFor);
                    return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mr-1">Schedule</span>
                        {options.map((opt) => (
                          <button
                            key={opt.label}
                            onClick={() => setNewTaskScheduledFor(opt.value)}
                            className={`px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors ${
                              newTaskScheduledFor === opt.value
                                ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]"
                                : "bg-[var(--surface)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        <input
                          type="date"
                          value={!isPreset && newTaskScheduledFor ? newTaskScheduledFor : ""}
                          onChange={(e) => setNewTaskScheduledFor(e.target.value || null)}
                          className={`bg-transparent border rounded-full px-2 py-0.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/30 ${
                            !isPreset && newTaskScheduledFor
                              ? "border-[var(--accent-blue)]/40 text-[var(--accent-blue)]"
                              : "border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                          }`}
                        />
                      </div>
                    );
                  })()}

                  {/* Brain dump → AI refine → create */}
                  {newTaskRoleId && (
                    <TaskBrainDump
                      roleId={newTaskRoleId}
                      roleName={roles.find(r => r.id === newTaskRoleId)?.name}
                      roleColor={roles.find(r => r.id === newTaskRoleId)?.color}
                      scheduledFor={newTaskScheduledFor}
                      onScheduleParsed={(iso) => setNewTaskScheduledFor(iso)}
                      onTaskCreated={() => {
                        window.dispatchEvent(new CustomEvent("tasks-changed"));
                      }}
                      onCancel={() => { setOpen(false); setAddTaskMode(false); }}
                    />
                  )}
                </div>
              ) : (
              <>
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 border-b border-[var(--border-subtle)]">
                <Search className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => handleChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search tasks, follow-ups, notes, transcripts..."
                  className="flex-1 bg-transparent py-4 text-[16px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                />
                {query && (
                  <button onClick={() => { setQuery(""); setResults(null); }} className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--sidebar-hover)]">
                    <X className="h-4 w-4 text-[var(--text-tertiary)]" />
                  </button>
                )}
              </div>

              {/* Results */}
              <div className="max-h-[60vh] overflow-y-auto">
                {loading && (
                  <div className="py-8 flex justify-center">
                    <div className="w-5 h-5 border-2 border-[var(--border-default)] border-t-[var(--accent-blue)] rounded-full animate-spin" />
                  </div>
                )}

                {/* AI Answer */}
                {aiAnswer && (
                  <div className="mx-3 my-3 rounded-xl border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-[var(--accent-blue)]" />
                      <p className="text-[12px] font-medium text-[var(--accent-blue)]">AI Answer</p>
                    </div>
                    <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
                  </div>
                )}

                {aiLoading && (
                  <div className="mx-3 my-3 rounded-xl border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/5 p-4 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 text-[var(--accent-blue)] animate-spin" />
                    <p className="text-[13px] text-[var(--accent-blue)]">Searching with AI...</p>
                  </div>
                )}

                {/* Ask AI button */}
                {!aiLoading && !aiAnswer && query.trim().length > 3 && (
                  <button
                    onClick={askAI}
                    className="mx-3 my-2 flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-colors w-[calc(100%-24px)]"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Ask AI about &ldquo;{query.trim().slice(0, 40)}&rdquo;
                  </button>
                )}

                {!loading && query && results && totalResults === 0 && !aiAnswer && (
                  <div className="py-8 text-center text-[var(--text-tertiary)] text-sm">No results found</div>
                )}

                {!loading && results && totalResults > 0 && (() => {
                  const actionOffset = showActions ? filteredActions.length : 0;
                  let runIdx = actionOffset;
                  return (
                  <div className="py-2">
                    {results.tasks.length > 0 && (
                      <Section icon={CheckSquare} label="Tasks">
                        {results.tasks.map((t) => {
                          const idx = runIdx++;
                          return (
                          <ResultRow key={t.id} role={t.role} selected={selectedIdx === idx} onMouseEnter={() => setSelectedIdx(idx)} onClick={() => setOpen(false)}>
                            <span className="text-[var(--text-primary)]">{t.title}</span>
                            {t.priority === "urgent" && <span className="text-[11px] font-bold text-red-400 ml-2">URGENT</span>}
                          </ResultRow>
                          );
                        })}
                      </Section>
                    )}
                    {results.followUps.length > 0 && (
                      <Section icon={Clock} label="Follow-ups">
                        {results.followUps.map((f) => {
                          const idx = runIdx++;
                          return (
                          <ResultRow key={f.id} role={f.role} selected={selectedIdx === idx} onMouseEnter={() => setSelectedIdx(idx)} onClick={() => setOpen(false)}>
                            <span className="text-[var(--text-primary)]">{f.title}</span>
                            <span className="text-[12px] text-[var(--text-tertiary)] ml-2">waiting on {f.waitingOn}</span>
                          </ResultRow>
                          );
                        })}
                      </Section>
                    )}
                  </div>
                  );
                })()}

                {/* Quick Actions */}
                {showActions && (
                  <div className="py-2">
                    <div className="flex items-center gap-2 px-4 py-2">
                      <RefreshCw className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                      <span className="text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Quick Actions</span>
                    </div>
                    {filteredActions.map((action, i) => (
                      <button
                        key={action.id}
                        onClick={() => action.action()}
                        onMouseEnter={() => setSelectedIdx(i)}
                        disabled={!!actionRunning}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left disabled:opacity-50 ${
                          selectedIdx === i ? "bg-[var(--sidebar-hover)]" : "hover:bg-[var(--sidebar-hover)]"
                        }`}
                      >
                        {actionRunning === action.id.replace("sync-", "")
                          ? <Loader2 className="h-4 w-4 text-[var(--accent-blue)] animate-spin shrink-0" />
                          : <action.icon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <span className="text-[15px] text-[var(--text-primary)]">{action.label}</span>
                          <span className="text-[13px] text-[var(--text-tertiary)] ml-2">{action.description}</span>
                        </div>
                        {selectedIdx === i && <kbd className="text-[11px] text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 shrink-0">↵</kbd>}
                      </button>
                    ))}
                  </div>
                )}

                {!query && filteredActions.length > 0 && (
                  <div className="px-4 pb-4 pt-2 text-center text-[var(--text-tertiary)] text-[13px]">
                    Type to search across tasks, follow-ups, notes, and transcripts
                  </div>
                )}
              </div>
              </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Section({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-4 py-2">
        <Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        <span className="text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">{label}</span>
      </div>
      {children}
    </div>
  );
}

function ResultRow({ role, children, onClick, selected, onMouseEnter }: { role: { name: string; color: string }; children: React.ReactNode; onClick: () => void; selected?: boolean; onMouseEnter?: () => void }) {
  return (
    <button onClick={onClick} onMouseEnter={onMouseEnter} className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${selected ? "bg-[var(--sidebar-hover)]" : "hover:bg-[var(--sidebar-hover)]"}`}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
      <div className="flex-1 min-w-0 flex items-center">{children}</div>
      <span className="text-[12px] text-[var(--text-tertiary)] shrink-0">{role.name}</span>
    </button>
  );
}
