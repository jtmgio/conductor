"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { GlobalSearch } from "./GlobalSearch";
import { Reminders } from "./Reminders";
import { MeetingAlert } from "./MeetingAlert";
import { CommsSweepAlert } from "./CommsSweepAlert";
import { BlockTransition, type TransitionBlock } from "./BlockTransition";
import { useHotkeys, type Shortcut } from "@/hooks/useHotkeys";
import { ScheduleProvider, useSchedule, type BlockInfo } from "./ScheduleContext";
import { cn } from "@/lib/utils";

function blockKey(b: BlockInfo): string {
  return `${b.id ?? ""}|${b.roleId ?? ""}|${b.timeLabel}`;
}

/**
 * Mounted once by src/app/(app)/layout.tsx, not per page — see that file for why.
 * The provider wraps the frame so pages rendered as `children` can read the schedule
 * from context instead of each fetching it themselves.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ScheduleProvider>
      <AppFrame>{children}</AppFrame>
    </ScheduleProvider>
  );
}

function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { currentBlock, nextBlocks } = useSchedule();

  // Block-transition ritual: fire the full-screen reset when the current work block
  // changes to a different one while the app is open. Mid-block opens don't fire
  // (prev starts null); localStorage guards against re-showing the same transition.
  const prevBlockRef = useRef<BlockInfo | null>(null);
  const [transition, setTransition] = useState<{ from: TransitionBlock; to: TransitionBlock } | null>(null);

  useEffect(() => {
    const cb = currentBlock;
    if (cb && cb.roleId) {
      const prev = prevBlockRef.current;
      // Only a genuine company switch earns the ritual. Comparing block keys alone let
      // "vQuip complete → Start vQuip" fire whenever a block's identity changed underneath
      // the same role — which is nonsense to read, and was the visible symptom of the
      // open-time block's label churning every minute.
      if (prev && prev.roleId && prev.roleId !== cb.roleId && blockKey(prev) !== blockKey(cb)) {
        const key = blockKey(cb);
        if (localStorage.getItem("conductor-transition-seen") !== key) {
          localStorage.setItem("conductor-transition-seen", key);
          setTransition({ from: prev, to: cb });
        }
      }
      prevBlockRef.current = cb;
    } else if (cb === null) {
      prevBlockRef.current = null;
    }
  }, [currentBlock]);

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
    // NOTE: the old per-device "daily reset" (POST /api/tasks/reset-today) was removed
    // for v2. It unscheduled every undone task on first app open of a new day, gated by
    // per-device localStorage — which meant opening a second machine wiped the plan you'd
    // made on the first. In v2, scheduledFor IS the persistent plan (shared DB) and undone
    // tasks stay until dealt with. Proper end-of-day carry-over is the queued rollover phase.

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
    { key: "1", modifiers: ["cmd"], action: () => router.push("/"), description: "Go to Today", category: "Navigation" },
    { key: "2", modifiers: ["cmd"], action: () => router.push("/board"), description: "Go to Board", category: "Navigation" },
    { key: "3", modifiers: ["cmd"], action: () => router.push("/tracker"), description: "Go to Tracker", category: "Navigation" },
    { key: "4", modifiers: ["cmd"], action: () => router.push("/formatter"), description: "Go to Formatter", category: "Navigation" },
    { key: "5", modifiers: ["cmd"], action: () => router.push("/meetings"), description: "Go to Meetings", category: "Navigation" },
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

      {/* Mandatory health/routine reminders — banner at/after each reminder's time on its days */}
      <Reminders />

      {/* Meeting starting soon — same unmissable modal, fires on every page */}
      <MeetingAlert />

      {/* Comms sweep due — go check your messages */}
      <CommsSweepAlert />

      {/* Block-transition ritual — full-screen reset between company blocks */}
      <AnimatePresence>
        {transition && (
          <BlockTransition
            from={transition.from}
            to={transition.to}
            onClose={() => setTransition(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
