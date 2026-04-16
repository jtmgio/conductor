"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MorningBriefing() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = "conductor-last-briefing";
    const today = new Date().toDateString();
    if (localStorage.getItem(key) === today) return;

    setLoading(true);
    fetch("/api/ai/briefing")
      .then((r) => r.json())
      .then((data) => {
        if (data.briefing) {
          setBriefing(data.briefing);
          localStorage.setItem(key, today);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dismiss = () => setDismissed(true);

  if (dismissed || (!loading && !briefing)) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mb-6 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-5"
      >
        <div className="flex items-start gap-3">
          <Sun className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Morning Briefing</h3>
              <button onClick={dismiss} className="p-1 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--text-tertiary)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating your daily briefing...
              </div>
            ) : (
              <div className="text-[14px] text-[var(--text-secondary)] leading-relaxed prose-briefing">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-[16px] font-bold mt-2 mb-1 text-[var(--text-primary)]">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-[15px] font-semibold mt-2 mb-1 text-[var(--text-primary)]">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-[14px] font-semibold mt-1.5 mb-0.5 text-[var(--text-primary)]">{children}</h3>,
                    p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-1.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-1.5">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed [&>p]:mb-0">{children}</li>,
                    hr: () => <hr className="border-[var(--border-subtle)] my-2" />,
                  }}
                >
                  {briefing}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
