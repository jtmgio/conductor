"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { GlobalSearch } from "./GlobalSearch";
import { useHotkeys, type Shortcut } from "@/hooks/useHotkeys";
import { cn } from "@/lib/utils";

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

export function AppShell({ children, currentBlock: propBlock, nextBlocks: propNextBlocks }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [fetchedBlock, setFetchedBlock] = useState<BlockInfo | null>(null);
  const [fetchedNextBlocks, setFetchedNextBlocks] = useState<BlockInfo[]>([]);
  const [scheduleFetched, setScheduleFetched] = useState(false);

  // Self-fetch schedule if not provided via props
  useEffect(() => {
    if (propBlock !== undefined) return; // parent provided it
    function fetchSchedule() {
      fetch("/api/schedule")
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) {
            setFetchedBlock(data.currentBlock || null);
            setFetchedNextBlocks(data.nextBlocks || []);
          }
          setScheduleFetched(true);
        })
        .catch(() => setScheduleFetched(true));
    }
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 60_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentBlock = propBlock !== undefined ? propBlock : fetchedBlock;
  const nextBlocks = propNextBlocks !== undefined ? propNextBlocks : fetchedNextBlocks;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("conductor-sidebar-collapsed") === "true";
    }
    return false;
  });

  // Auto-collapse sidebar on board page for more space
  useEffect(() => {
    if (pathname === "/" || pathname === "/board") {
      setSidebarCollapsed(true);
      localStorage.setItem("conductor-sidebar-collapsed", "true");
    }
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("conductor-sidebar-collapsed", String(next));
      return next;
    });
  }, []);

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

    // Calendar sync — trigger if last sync was more than 65 minutes ago
    // (LaunchAgent runs hourly on the hour, 7 AM - 4 PM weekdays; 65 min gives a 5 min buffer)
    const lastCalSyncKey = "conductor-last-cal-sync";
    const lastCalSync = localStorage.getItem(lastCalSyncKey);
    const sixtyFiveMinAgo = Date.now() - 65 * 60 * 1000;
    if (!lastCalSync || parseInt(lastCalSync) < sixtyFiveMinAgo) {
      fetch("/api/calendar/sync", { method: "POST" })
        .then((res) => {
          if (res.ok) localStorage.setItem(lastCalSyncKey, String(Date.now()));
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
    { key: "[", modifiers: ["cmd"], action: toggleSidebar, description: "Toggle sidebar", category: "General" },
    { key: "?", action: toggleShortcuts, description: "Show keyboard shortcuts", category: "General" },
    { key: "Escape", action: closeShortcuts, description: "Close dialog", category: "General", allowInInput: true },
  ], [router, toggleSidebar, toggleShortcuts, closeShortcuts]);

  useHotkeys(shortcuts);

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--text-primary)]" data-sidebar-collapsed={sidebarCollapsed}>
      <Sidebar currentBlock={currentBlock} nextBlocks={nextBlocks} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
      <MobileDrawer currentBlock={currentBlock} />

      <main className={cn("pt-[max(4rem,calc(3rem+env(safe-area-inset-top)))] pb-8 lg:pt-4 lg:pb-8 transition-all duration-200", sidebarCollapsed ? "lg:ml-[60px]" : "lg:ml-[280px]")}>
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
      {/* GlobalSearch always mounted for ⌘K even when sidebar is collapsed */}
      {sidebarCollapsed && <GlobalSearch hideTrigger />}
    </div>
  );
}
