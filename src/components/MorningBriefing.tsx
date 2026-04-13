"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, X, Loader2 } from "lucide-react";

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
              <div className="text-[14px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {briefing}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
