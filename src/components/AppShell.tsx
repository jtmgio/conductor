"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";

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

  useEffect(() => {
    const lastResetKey = "conductor-last-reset";
    const today = new Date().toDateString();
    const lastReset = localStorage.getItem(lastResetKey);

    if (lastReset !== today) {
      fetch("/api/tasks/reset-today", { method: "POST" })
        .then(() => localStorage.setItem(lastResetKey, today))
        .catch(() => {});
    }
  }, []);

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
    </div>
  );
}
