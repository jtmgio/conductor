"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, CheckSquare, Clock, FileText, MessageSquare, Sparkles, Loader2 } from "lucide-react";

interface SearchResult {
  tasks: Array<{ id: string; title: string; priority: string; dueDate?: string; role: { id: string; name: string; color: string } }>;
  followUps: Array<{ id: string; title: string; waitingOn: string; role: { id: string; name: string; color: string } }>;
  notes: Array<{ id: string; content: string; createdAt: string; role: { id: string; name: string; color: string } }>;
  transcripts: Array<{ id: string; preview: string; createdAt: string; role: { id: string; name: string; color: string } }>;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

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
    if (!open) { setQuery(""); setResults(null); setAiAnswer(null); }
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

  const totalResults = results
    ? results.tasks.length + results.followUps.length + results.notes.length + results.transcripts.length
    : 0;

  return (
    <>
      {/* Trigger button for sidebar */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 py-2.5 px-4 rounded-lg w-full text-[var(--sidebar-text)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)] transition-all duration-200 border-l-2 border-transparent"
      >
        <Search className="h-[18px] w-[18px] opacity-60" />
        <span className="text-[15px]">Search</span>
        <kbd className="ml-auto text-[11px] text-[var(--text-tertiary)] bg-[var(--surface)] px-1.5 py-0.5 rounded hidden lg:inline">⌘K</kbd>
      </button>

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
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 border-b border-[var(--border-subtle)]">
                <Search className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => handleChange(e.target.value)}
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

                {!loading && results && totalResults > 0 && (
                  <div className="py-2">
                    {results.tasks.length > 0 && (
                      <Section icon={CheckSquare} label="Tasks">
                        {results.tasks.map((t) => (
                          <ResultRow key={t.id} role={t.role} onClick={() => setOpen(false)}>
                            <span className="text-[var(--text-primary)]">{t.title}</span>
                            {t.priority === "urgent" && <span className="text-[11px] font-bold text-red-400 ml-2">URGENT</span>}
                          </ResultRow>
                        ))}
                      </Section>
                    )}
                    {results.followUps.length > 0 && (
                      <Section icon={Clock} label="Follow-ups">
                        {results.followUps.map((f) => (
                          <ResultRow key={f.id} role={f.role} onClick={() => setOpen(false)}>
                            <span className="text-[var(--text-primary)]">{f.title}</span>
                            <span className="text-[12px] text-[var(--text-tertiary)] ml-2">waiting on {f.waitingOn}</span>
                          </ResultRow>
                        ))}
                      </Section>
                    )}
                    {results.notes.length > 0 && (
                      <Section icon={FileText} label="Notes">
                        {results.notes.map((n) => (
                          <ResultRow key={n.id} role={n.role} onClick={() => setOpen(false)}>
                            <span className="text-[var(--text-secondary)] text-[14px] truncate">{n.content}</span>
                          </ResultRow>
                        ))}
                      </Section>
                    )}
                    {results.transcripts.length > 0 && (
                      <Section icon={MessageSquare} label="Transcripts">
                        {results.transcripts.map((t) => (
                          <ResultRow key={t.id} role={t.role} onClick={() => setOpen(false)}>
                            <span className="text-[var(--text-secondary)] text-[14px] truncate">{t.preview}</span>
                          </ResultRow>
                        ))}
                      </Section>
                    )}
                  </div>
                )}

                {!query && (
                  <div className="py-8 text-center text-[var(--text-tertiary)] text-sm">
                    Type to search across everything
                  </div>
                )}
              </div>
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

function ResultRow({ role, children, onClick }: { role: { name: string; color: string }; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--sidebar-hover)] transition-colors text-left">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
      <div className="flex-1 min-w-0 flex items-center">{children}</div>
      <span className="text-[12px] text-[var(--text-tertiary)] shrink-0">{role.name}</span>
    </button>
  );
}
