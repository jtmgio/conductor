"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRightLeft, X, Loader2 } from "lucide-react";

interface RoleHandoffProps {
  roleId: string | null;
}

export function RoleHandoff({ roleId }: RoleHandoffProps) {
  const [handoff, setHandoff] = useState<{ text: string; roleName: string; roleColor: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const previousRoleRef = useRef<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!roleId) return;

    // Only trigger on role change, not initial load
    if (previousRoleRef.current && previousRoleRef.current !== roleId) {
      setLoading(true);
      fetch(`/api/ai/handoff?roleId=${roleId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.handoff) {
            setHandoff({ text: data.handoff, roleName: data.roleName, roleColor: data.roleColor });
            // Auto-dismiss after 30s
            timerRef.current = setTimeout(() => setHandoff(null), 30000);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    previousRoleRef.current = roleId;

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [roleId]);

  if (!loading && !handoff) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="mb-4 rounded-xl border px-4 py-3"
        style={{ borderColor: `${handoff?.roleColor || "#666"}30`, backgroundColor: `${handoff?.roleColor || "#666"}08` }}
      >
        <div className="flex items-start gap-3">
          <ArrowRightLeft className="h-4 w-4 mt-0.5 shrink-0" style={{ color: handoff?.roleColor || "var(--text-tertiary)" }} />
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing context...
              </div>
            ) : handoff && (
              <>
                <p className="text-[12px] font-medium mb-1" style={{ color: handoff.roleColor }}>
                  Switching to {handoff.roleName}
                </p>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{handoff.text}</p>
              </>
            )}
          </div>
          {handoff && (
            <button onClick={() => setHandoff(null)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
