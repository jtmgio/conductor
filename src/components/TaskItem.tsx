"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

interface TaskItemProps {
  id: string;
  title: string;
  priority: string;
  roleColor: string;
  onComplete: (id: string) => void;
}

export function TaskItem({ id, title, priority, roleColor, onComplete }: TaskItemProps) {
  const [completing, setCompleting] = useState(false);

  const handleComplete = () => {
    setCompleting(true);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setTimeout(() => onComplete(id), 400);
  };

  return (
    <AnimatePresence>
      {!completing && (
        <motion.div
          layout
          initial={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 80, scale: 0.95 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--border-subtle)] active:scale-[0.98] transition-transform duration-150"
        >
          <div className="flex items-center gap-3.5 px-[18px] py-[14px]">
            <button
              onClick={handleComplete}
              className="w-11 h-11 -ml-2 flex-shrink-0 flex items-center justify-center cursor-pointer"
              aria-label="Complete task"
            >
              <span
                className="w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors"
                style={{
                  borderColor: completing
                    ? roleColor
                    : `color-mix(in srgb, ${roleColor} 30%, transparent)`,
                  backgroundColor: completing
                    ? `color-mix(in srgb, ${roleColor} 15%, transparent)`
                    : "transparent",
                }}
              >
                {completing && <Check className="w-3.5 h-3.5" style={{ color: roleColor }} />}
              </span>
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              {priority === "urgent" && (
                <span className="text-[12px] font-bold tracking-wide text-red-400 uppercase">
                  URGENT
                </span>
              )}
              <p className="text-base leading-relaxed text-[var(--text-primary)]">{title}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
