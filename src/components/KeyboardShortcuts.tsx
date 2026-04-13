"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { SHORTCUT_DEFINITIONS } from "@/hooks/useHotkeys";

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[11px] font-mono font-medium text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}

function formatKey(key: string, modifiers?: string[]): React.ReactNode {
  const parts: string[] = [];
  if (modifiers?.includes("cmd")) parts.push("⌘");
  if (modifiers?.includes("shift")) parts.push("⇧");
  if (modifiers?.includes("alt")) parts.push("⌥");

  const displayKey = key === "Enter" ? "↵"
    : key === "Escape" ? "Esc"
    : key === "Backspace" ? "⌫"
    : key === "," ? ","
    : key === "[" ? "["
    : key === "]" ? "]"
    : key === "/" ? "/"
    : key === "?" ? "?"
    : key.toUpperCase();

  if (parts.length > 0) {
    return <KeyBadge>{parts.join("") + displayKey}</KeyBadge>;
  }
  return <KeyBadge>{displayKey}</KeyBadge>;
}

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  // Group shortcuts by category
  const grouped: Record<string, typeof SHORTCUT_DEFINITIONS> = {};
  for (const s of SHORTCUT_DEFINITIONS) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  }

  const categoryOrder = ["Navigation", "Create", "Focus", "Tasks", "AI Chat", "General"];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[680px] max-h-[80vh] overflow-y-auto bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl z-50 p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">Keyboard Shortcuts</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[var(--sidebar-hover)] text-[var(--text-tertiary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {categoryOrder.map((cat) => {
                const items = grouped[cat];
                if (!items?.length) return null;
                return (
                  <div key={cat}>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">
                      {cat}
                    </p>
                    <div className="space-y-1.5">
                      {items.map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-1">
                          <span className="text-[13px] text-[var(--text-secondary)]">{s.description}</span>
                          <span className="ml-3 shrink-0">{formatKey(s.key, s.modifiers)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] text-center">
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Press <KeyBadge>?</KeyBadge> anytime to show this overlay &middot; <KeyBadge>Esc</KeyBadge> to close
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
