"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FollowUpCardProps {
  id: string;
  title: string;
  waitingOn: string;
  roleColor: string;
  createdAt: string;
  staleDays: number;
  onResolve: (id: string) => void;
  onNudge: (id: string) => void;
}

export function FollowUpCard({ id, title, waitingOn, roleColor, createdAt, staleDays, onResolve, onNudge }: FollowUpCardProps) {
  const [resolving, setResolving] = useState(false);
  const daysSince = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const isStale = daysSince >= staleDays;

  const handleResolve = () => {
    setResolving(true);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    setTimeout(() => onResolve(id), 400);
  };

  return (
    <AnimatePresence>
      {!resolving && (
        <motion.div layout initial={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 80, scale: 0.95 }} transition={{ duration: 0.4, ease: "easeOut" }}
          className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-subtle)] overflow-hidden"
        >
          <div className="flex">
            <div className="w-[3px] shrink-0" style={{ backgroundColor: roleColor }} />
            <div className="flex-1 p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="text-[17px] font-medium text-[var(--text-primary)]">{title}</h3>
                  <p className="text-[14px] text-[var(--text-secondary)] mt-0.5">Waiting on {waitingOn}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-3">
                  {isStale && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                  <span className={isStale ? "text-[14px] font-semibold text-orange-400" : "text-[14px] text-[var(--text-tertiary)]"}>{daysSince}d</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <button onClick={handleResolve} className="text-[14px] font-semibold text-[var(--accent-blue)] hover:opacity-80 transition-opacity min-h-[44px] flex items-center">MARK RECEIVED</button>
                {isStale && <button onClick={() => onNudge(id)} className="text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors min-h-[44px] flex items-center">Follow up &rarr;</button>}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
