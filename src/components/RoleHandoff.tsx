"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Pause, SkipForward, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface RoleHandoffProps {
  roleId: string;
  roleName: string;
  roleColor: string;
  roleTitle?: string | null;
  onDismiss: () => void;
  onPause: (minutes: number) => void;
  onSkip: () => void;
}

export function RoleHandoff({ roleId, roleName, roleColor, roleTitle, onDismiss, onPause, onSkip }: RoleHandoffProps) {
  const [handoff, setHandoff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch AI handoff context
  useEffect(() => {
    setLoading(true);
    fetch(`/api/ai/handoff?roleId=${roleId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.handoff) setHandoff(data.handoff);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roleId]);

  // Auto-dismiss after 60 seconds
  useEffect(() => {
    autoDismissRef.current = setTimeout(onDismiss, 60_000);
    return () => { if (autoDismissRef.current) clearTimeout(autoDismissRef.current); };
  }, [onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <p className="text-[13px] text-[var(--text-tertiary)] mb-1">Switching to</p>
            <div className="flex items-center gap-2.5">
              <h2
                className="text-[28px] font-bold leading-tight"
                style={{ color: roleColor }}
              >
                {roleName}
              </h2>
              <span
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ backgroundColor: roleColor }}
              />
            </div>
            {roleTitle && (
              <p className="text-[15px] text-[var(--text-secondary)] mt-0.5">{roleTitle}</p>
            )}
          </div>

          {/* Divider */}
          <div className="mx-6 border-t border-[var(--border-subtle)]" />

          {/* AI Handoff Context */}
          <div className="px-6 py-4 min-h-[80px]">
            {loading ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading context...
              </div>
            ) : handoff ? (
              <div className="text-[13px] text-[var(--text-secondary)] leading-relaxed [&_strong]:text-[var(--text-primary)] [&_p]:mb-1.5 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:mb-0.5">
                <ReactMarkdown>{handoff}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-[13px] text-[var(--text-tertiary)]">Ready when you are.</p>
            )}
          </div>

          {/* Divider */}
          <div className="mx-6 border-t border-[var(--border-subtle)]" />

          {/* Actions */}
          <div className="px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => onPause(5)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] rounded-lg transition-colors"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause 5 min
            </button>
            <button
              onClick={onSkip}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] rounded-lg transition-colors"
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip
            </button>
            <div className="flex-1" />
            <button
              onClick={onDismiss}
              className="flex items-center gap-1.5 px-5 py-2.5 text-[13px] font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: `${roleColor}20`,
                color: roleColor,
              }}
            >
              Let&apos;s go
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
