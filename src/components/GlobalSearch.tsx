"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, CheckSquare, Clock, FileText, MessageSquare, Sparkles, Loader2, RefreshCw, Calendar, Mic, Link2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTaskSuggestion } from "@/hooks/useTaskSuggestion";
import { TaskSuggestionBox } from "@/components/TaskSuggestionBox";

interface SearchResult {
  tasks: Array<{ id: string; title: string; priority: string; dueDate?: string; role: { id: string; name: string; color: string } }>;
  followUps: Array<{ id: string; title: string; waitingOn: string; role: { id: string; name: string; color: string } }>;
  notes: Array<{ id: string; content: string; createdAt: string; role: { id: string; name: string; color: string } }>;
  transcripts: Array<{ id: string; preview: string; createdAt: string; role: { id: string; name: string; color: string } }>;
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
  const [roles, setRoles] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const { suggestion, setSuggestion, requestSuggestion, applyTaskSuggestion } = useTaskSuggestion();
  const inputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const roleSelectRef = useRef<HTMLSelectElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

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
      id: "sync-granola",
      label: "Sync Granola",
      description: "Pull meeting transcripts into Inbox",
      icon: Mic,
      keywords: ["sync", "granola", "meetings", "transcripts"],
      action: () => runSync("granola", "/inbox"),
    },
    {
      id: "sync-linear",
      label: "Sync Linear",
      description: "Import tasks from Linear",
      icon: Link2,
      keywords: ["sync", "linear", "tasks", "import"],
      action: () => runSync("linear", "/board"),
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
          isToday: newTaskIsToday,
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
    ? results.tasks.length + results.followUps.length + results.notes.length + results.transcripts.length
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
    for (let i = 0; i < results.notes.length; i++) selectableItems.push({ type: "result", category: "notes", idx: i });
    for (let i = 0; i < results.transcripts.length; i++) selectableItems.push({ type: "result", category: "transcripts", idx: i });
  }

  // Reset selection when items change
  useEffect(() => { setSelectedIdx(0); }, [query, totalResults]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
    if (!open) { setQuery(""); setResults(null); setAiAnswer(null); setAddTaskMode(false); setNewTaskTitle(""); }
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
              {addTaskMode ? (
                /* ── Add Task Mode ── */
                <div className="p-4 space-y-4">
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

                  {/* Title input — tab index 2 */}
                  <input
                    ref={taskInputRef}
                    tabIndex={2}
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); submitTask(); }
                      if (e.key === "Escape") { e.preventDefault(); setOpen(false); setAddTaskMode(false); }
                    }}
                    placeholder="Task title..."
                    className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[16px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 placeholder:text-[var(--text-tertiary)]"
                  />

                  {/* Options row */}
                  <div className="flex items-center gap-3">
                    <button
                      tabIndex={3}
                      onClick={() => setNewTaskPriority(newTaskPriority === "normal" ? "urgent" : "normal")}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 focus:ring-2 focus:ring-[var(--accent-blue)]/20 outline-none ${
                        newTaskPriority === "urgent"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-[var(--surface)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      {newTaskPriority === "urgent" ? "Urgent" : "Normal"}
                    </button>
                    <button
                      tabIndex={4}
                      onClick={() => setNewTaskIsToday(!newTaskIsToday)}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 focus:ring-2 focus:ring-[var(--accent-blue)]/20 outline-none ${
                        newTaskIsToday
                          ? "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]"
                          : "bg-[var(--surface)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      {newTaskIsToday ? "Today" : "Backlog"}
                    </button>
                    <div className="flex-1" />
                    <button
                      tabIndex={5}
                      onClick={submitTask}
                      disabled={!newTaskTitle.trim() || !newTaskRoleId}
                      className="px-5 py-2 rounded-xl bg-[var(--accent-blue)] text-white text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-30 focus:ring-2 focus:ring-[var(--accent-blue)]/40 outline-none"
                    >
                      Add
                    </button>
                  </div>

                  {/* AI suggestion bar */}
                  {suggestion && (
                    <TaskSuggestionBox
                      suggestion={suggestion}
                      onDismiss={() => setSuggestion(null)}
                      onApply={applyTaskSuggestion}
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
                    {results.notes.length > 0 && (
                      <Section icon={FileText} label="Notes">
                        {results.notes.map((n) => {
                          const idx = runIdx++;
                          return (
                          <ResultRow key={n.id} role={n.role} selected={selectedIdx === idx} onMouseEnter={() => setSelectedIdx(idx)} onClick={() => setOpen(false)}>
                            <span className="text-[var(--text-secondary)] text-[14px] truncate">{n.content}</span>
                          </ResultRow>
                          );
                        })}
                      </Section>
                    )}
                    {results.transcripts.length > 0 && (
                      <Section icon={MessageSquare} label="Transcripts">
                        {results.transcripts.map((t) => {
                          const idx = runIdx++;
                          return (
                          <ResultRow key={t.id} role={t.role} selected={selectedIdx === idx} onMouseEnter={() => setSelectedIdx(idx)} onClick={() => setOpen(false)}>
                            <span className="text-[var(--text-secondary)] text-[14px] truncate">{t.preview}</span>
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
