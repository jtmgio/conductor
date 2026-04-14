"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Crosshair, Inbox, ListChecks, Columns3, Sparkles, Settings, LogOut, FileText, Send, CalendarDays, Search } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "Focus", icon: Crosshair },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tracker", label: "Tracker", icon: ListChecks },
  { href: "/board", label: "Board", icon: Columns3 },
  { href: "/ai", label: "AI", icon: Sparkles },
  { href: "/documents", label: "Notes", icon: FileText },
  { href: "/drafts", label: "Drafts", icon: Send },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface MobileDrawerProps {
  currentBlock?: {
    label: string;
    timeLabel: string;
    roleId: string | null;
    roleName?: string;
    roleColor?: string;
  } | null;
}

export function MobileDrawer({ currentBlock }: MobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const blockColor = currentBlock?.roleColor || "#706c65";

  return (
    <div className="lg:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-[max(1rem,env(safe-area-inset-top))] left-4 z-50 w-10 h-10 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shadow-sm"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/50"
            />

            {/* Drawer */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--sidebar-bg)] rounded-t-2xl max-h-[85vh] overflow-hidden"
            >
              {/* Handle + close */}
              <div className="flex items-center justify-between px-5 pt-3 pb-1">
                <div className="w-8 h-1 rounded-full bg-[var(--border-default)] mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
                <span className="text-[15px] font-semibold text-[var(--text-primary)]">Conductor</span>
                <button
                  onClick={() => setOpen(false)}
                  className="w-9 h-9 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center justify-center text-[var(--text-tertiary)]"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>

              {/* Current block */}
              {currentBlock && (
                <div className="mx-5 mt-3 rounded-xl p-3.5 border border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-2 h-2 rounded-full animate-pulse shrink-0"
                      style={{ backgroundColor: blockColor }}
                    />
                    <span className="text-[13px] text-[var(--text-tertiary)]">
                      {currentBlock.timeLabel}
                    </span>
                  </div>
                  <p className="text-[17px] font-semibold" style={{ color: blockColor }}>
                    {currentBlock.roleName || "Triage"}
                  </p>
                </div>
              )}

              {/* Search button */}
              <button
                onClick={() => {
                  setOpen(false);
                  setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })), 200);
                }}
                className="mx-3 mt-3 flex items-center gap-3 py-3 px-4 rounded-xl w-[calc(100%-24px)] text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] transition-colors min-h-[48px] border border-[var(--border-subtle)]"
              >
                <Search className="h-5 w-5 opacity-60" />
                <span className="text-[16px]">Search</span>
                <span className="ml-auto text-[12px] text-[var(--text-tertiary)]">Tasks, notes, follow-ups</span>
              </button>

              {/* Nav links */}
              <nav className="px-3 py-4 space-y-0.5">
                {navLinks.map((link) => {
                  const active =
                    link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 py-3 px-4 rounded-xl transition-all min-h-[48px]",
                        active
                          ? "bg-[var(--sidebar-active)] text-[var(--text-primary)] font-medium"
                          : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)]"
                      )}
                    >
                      <link.icon className={cn("h-5 w-5", active ? "opacity-100" : "opacity-60")} />
                      <span className="text-[16px]">{link.label}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Sign out */}
              <div className="border-t border-[var(--border-subtle)] mx-4" />
              <div className="px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex items-center gap-3 py-3 px-4 rounded-xl w-full text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] transition-colors min-h-[48px]"
                >
                  <LogOut className="h-5 w-5 opacity-60" />
                  <span className="text-[16px]">Sign out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
