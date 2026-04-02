"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Crosshair, Inbox, ListChecks, Columns3, Sparkles, Workflow, Keyboard, DollarSign, Settings, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeSwitcher } from "./ThemeSwitcher";

const ROLE_COLORS: Record<string, string> = {
  zeta: "#4d8ef7",
  healthmap: "#2dd4bf",
  vquip: "#a78bfa",
  healthme: "#fbbf24",
  xenegrade: "#8cbf6e",
  reacthealth: "#fb7185",
};

const navLinks = [
  { href: "/", label: "Focus", icon: Crosshair },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tracker", label: "Tracker", icon: ListChecks },
  { href: "/board", label: "Board", icon: Columns3 },
  { href: "/ai", label: "AI", icon: Sparkles },
  { href: "/flow", label: "Flow", icon: Workflow },
  { href: "/keys", label: "Keys", icon: Keyboard },
  { href: "/costs", label: "Costs", icon: DollarSign },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  currentBlock?: {
    label: string;
    timeLabel: string;
    roleId: string | null;
    roleName?: string;
    roleTitle?: string;
    roleColor?: string;
  } | null;
  nextBlocks?: Array<{
    label: string;
    timeLabel: string;
    roleId: string | null;
    roleName?: string;
    roleColor?: string;
  }>;
}

export function Sidebar({ currentBlock, nextBlocks }: SidebarProps) {
  const pathname = usePathname();

  const blockColor = currentBlock?.roleColor
    || (currentBlock?.roleId ? ROLE_COLORS[currentBlock.roleId] : null)
    || "#706c65";

  return (
    <aside className="fixed left-0 top-0 h-full w-[280px] hidden lg:flex flex-col bg-[var(--sidebar-bg)] z-50">
      {/* Branding */}
      <div className="px-6 pt-7 pb-2">
        <h1 className="text-[22px] font-semibold text-[var(--text-primary)]">
          Conductor
        </h1>
      </div>

      {/* Current block card */}
      <div className="px-4 py-3">
        {currentBlock ? (
          <div className="rounded-xl p-4 border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className="w-2 h-2 rounded-full animate-pulse shrink-0"
                style={{ backgroundColor: blockColor }}
              />
              <span className="text-[14px] text-[var(--text-tertiary)]">
                {currentBlock.timeLabel}
              </span>
            </div>
            <p
              className="text-[17px] font-semibold leading-tight"
              style={{ color: blockColor }}
            >
              {currentBlock.roleName || "Triage"}
            </p>
            {currentBlock.roleTitle && (
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {currentBlock.roleTitle}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl p-4 border border-[var(--border-subtle)]">
            <p className="text-[15px] text-[var(--text-tertiary)]">Off the clock</p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-3 pb-1">
        <GlobalSearch />
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-2 px-3 space-y-0.5">
        {navLinks.map((link) => {
          const active =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 py-2.5 px-4 rounded-lg transition-all duration-200 border-l-2",
                active
                  ? "bg-[var(--sidebar-active)] text-[var(--text-primary)] font-medium border-[var(--accent-blue)]"
                  : "text-[var(--sidebar-text)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)] border-transparent"
              )}
            >
              <link.icon
                className={cn(
                  "h-5 w-5",
                  active ? "opacity-100" : "opacity-60"
                )}
              />
              <span className="text-[16px]">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Coming up */}
      {nextBlocks && nextBlocks.length > 0 && (
        <div className="mt-auto">
          <div className="border-t border-[var(--border-subtle)] mx-4" />
          <div className="px-6 pt-4 pb-4">
            <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">
              Coming up
            </p>
            <div className="space-y-2.5">
              {nextBlocks.map((block, i) => {
                const color = block.roleColor
                  || (block.roleId ? ROLE_COLORS[block.roleId] : null)
                  || "#706c65";
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[14px] text-[var(--sidebar-text-muted)] truncate flex-1">
                      {block.roleName || "Open"}
                    </span>
                    <span className="text-[14px] text-[var(--sidebar-text-muted)] shrink-0">
                      {block.timeLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Theme switcher */}
      <div className={cn("px-4 pb-2", !nextBlocks?.length && "mt-auto")}>
        <ThemeSwitcher />
      </div>

      {/* Logout */}
      <div className="px-3 pb-4">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 py-2.5 px-4 rounded-lg w-full text-[var(--sidebar-text)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)] transition-all duration-200 border-l-2 border-transparent"
        >
          <LogOut className="h-5 w-5 opacity-60" />
          <span className="text-[16px]">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
