"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { useHotkeys, type Shortcut } from "@/hooks/useHotkeys";

interface BlockInfo {
  label: string;
  timeLabel: string;
  roleId: string | null;
  roleName?: string;
  roleColor?: string;
}

interface AppShellProps {
  children: React.ReactNode;
  currentBlock?: BlockInfo | null;
  nextBlocks?: BlockInfo[];
}

export function AppShell({ children, currentBlock, nextBlocks }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const today = new Date().toDateString();

    // Daily reset — move incomplete today-tasks back to backlog
    const lastResetKey = "conductor-last-reset";
    const lastReset = localStorage.getItem(lastResetKey);
    if (lastReset !== today) {
      fetch("/api/tasks/reset-today", { method: "POST" })
        .then(() => localStorage.setItem(lastResetKey, today))
        .catch(() => {});
    }

    // Calendar sync — trigger if it hasn't run today (covers missed 5am cron)
    const lastCalSyncKey = "conductor-last-cal-sync";
    const lastCalSync = localStorage.getItem(lastCalSyncKey);
    if (lastCalSync !== today) {
      fetch("/api/calendar/sync", { method: "POST" })
        .then((res) => {
          if (res.ok) localStorage.setItem(lastCalSyncKey, today);
        })
        .catch(() => {});
    }
  }, []);

  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), []);
  const closeShortcuts = useCallback(() => setShowShortcuts(false), []);

  const shortcuts: Shortcut[] = useMemo(() => [
    // Navigation
    { key: "1", modifiers: ["cmd"], action: () => router.push("/"), description: "Go to Focus", category: "Navigation" },
    { key: "2", modifiers: ["cmd"], action: () => router.push("/inbox"), description: "Go to Inbox", category: "Navigation" },
    { key: "3", modifiers: ["cmd"], action: () => router.push("/tracker"), description: "Go to Tracker", category: "Navigation" },
    { key: "4", modifiers: ["cmd"], action: () => router.push("/board"), description: "Go to Board", category: "Navigation" },
    { key: "5", modifiers: ["cmd"], action: () => router.push("/ai"), description: "Go to AI", category: "Navigation" },
    { key: "6", modifiers: ["cmd"], action: () => router.push("/documents"), description: "Go to Documents", category: "Navigation" },
    { key: "7", modifiers: ["cmd"], action: () => router.push("/drafts"), description: "Go to Drafts", category: "Navigation" },
    { key: ",", modifiers: ["cmd"], action: () => router.push("/settings"), description: "Go to Settings", category: "Navigation" },

    // Note: Cmd+K is handled by GlobalSearch component directly

    // General
    { key: "?", action: toggleShortcuts, description: "Show keyboard shortcuts", category: "General" },
    { key: "Escape", action: closeShortcuts, description: "Close dialog", category: "General", allowInInput: true },
  ], [router, toggleShortcuts, closeShortcuts]);

  useHotkeys(shortcuts);

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--text-primary)]">
      <Sidebar currentBlock={currentBlock} nextBlocks={nextBlocks} />
      <MobileDrawer currentBlock={currentBlock} />

      <main className="pt-16 pb-8 lg:pt-4 lg:pb-8 lg:ml-[280px]">
        <div className="px-5 lg:px-8 lg:pt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <KeyboardShortcuts open={showShortcuts} onClose={closeShortcuts} />
    </div>
  );
}
