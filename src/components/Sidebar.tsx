"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Crosshair, Inbox, ListChecks, Columns3, Sparkles, Settings, LogOut, BookOpen, FileText, Send, PanelLeftClose, Menu, CalendarDays } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "./GlobalSearch";
import { ConductorLogo } from "./ConductorLogo";

const navLinks = [
  { href: "/", label: "Focus", icon: Crosshair, shortcut: "⌘1" },
  { href: "/meetings", label: "Meetings", icon: CalendarDays, shortcut: "⌘2" },
  { href: "/inbox", label: "Inbox", icon: Inbox, shortcut: "⌘3" },
  { href: "/tracker", label: "Tracker", icon: ListChecks, shortcut: "⌘4" },
  { href: "/board", label: "Board", icon: Columns3, shortcut: "⌘5" },
  { href: "/ai", label: "AI", icon: Sparkles, shortcut: "⌘6" },
  { href: "/documents", label: "Notes", icon: FileText, shortcut: "⌘7" },
  { href: "/drafts", label: "Drafts", icon: Send, shortcut: "⌘8" },
];

const bottomLinks = [
  { href: "/docs", label: "Docs", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings, shortcut: "⌘," },
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ currentBlock, nextBlocks, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  const blockColor = currentBlock?.roleColor || "#6B675F";

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full hidden lg:flex flex-col bg-[var(--sidebar-bg)] z-50 transition-all duration-200",
      collapsed ? "w-[60px]" : "w-[280px]"
    )}>
      {/* Header: logo + hamburger/collapse toggle */}
      <div className={cn(
        "flex items-center pt-5 pb-2",
        collapsed ? "px-2 justify-center" : "px-6 justify-between"
      )}>
        {collapsed ? (
          <button
            onClick={onToggleCollapse}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)] transition-colors"
            title="Expand sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : (
          <>
            <ConductorLogo size={24} showWordmark />
            <button
              onClick={onToggleCollapse}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)] transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Current block card */}
      {!collapsed ? (
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
      ) : (
        <div className="px-2 py-3 flex justify-center">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: blockColor }}
            title={currentBlock ? `${currentBlock.roleName || "Triage"} — ${currentBlock.timeLabel}` : "Off the clock"}
          />
        </div>
      )}

      {/* Search — always mounted for ⌘K, trigger hidden when collapsed */}
      {!collapsed && (
        <div className="px-3 pb-1">
          <GlobalSearch />
        </div>
      )}

      {/* Nav links */}
      <nav className={cn("flex-1 py-2 flex flex-col", collapsed ? "px-1.5" : "px-3")}>
        <div className="space-y-0.5">
          {navLinks.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                title={collapsed ? link.label : undefined}
                className={cn(
                  "group relative flex items-center rounded-lg transition-all duration-200",
                  collapsed ? "justify-center py-2.5 px-0" : "gap-3 py-2.5 px-4 border-l-2",
                  active
                    ? cn(
                        "bg-[var(--sidebar-active)] text-[var(--text-primary)] font-medium",
                        !collapsed && "border-[var(--accent-blue)]"
                      )
                    : cn(
                        "text-[var(--sidebar-text)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)]",
                        !collapsed && "border-transparent"
                      )
                )}
              >
                <link.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    active ? "opacity-100" : "opacity-40"
                  )}
                />
                {!collapsed && <span className="text-[16px] flex-1">{link.label}</span>}
                {!collapsed && link.shortcut && (
                  <kbd className="text-[11px] font-mono text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 opacity-60">
                    {link.shortcut}
                  </kbd>
                )}
                {/* Tooltip on hover when collapsed */}
                {collapsed && (
                  <span className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg z-50">
                    {link.label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="mt-auto space-y-0.5">
          {bottomLinks.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                title={collapsed ? link.label : undefined}
                className={cn(
                  "group relative flex items-center rounded-lg transition-all duration-200",
                  collapsed ? "justify-center py-2.5 px-0" : "gap-3 py-2.5 px-4 border-l-2",
                  active
                    ? cn(
                        "bg-[var(--sidebar-active)] text-[var(--text-primary)] font-medium",
                        !collapsed && "border-[var(--accent-blue)]"
                      )
                    : cn(
                        "text-[var(--sidebar-text)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)]",
                        !collapsed && "border-transparent"
                      )
                )}
              >
                <link.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    active ? "opacity-100" : "opacity-40"
                  )}
                />
                {!collapsed && <span className="text-[16px] flex-1">{link.label}</span>}
                {!collapsed && link.shortcut && (
                  <kbd className="text-[11px] font-mono text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 opacity-60">
                    {link.shortcut}
                  </kbd>
                )}
                {collapsed && (
                  <span className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg z-50">
                    {link.label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Coming up */}
      {!collapsed && nextBlocks && nextBlocks.length > 0 && (
        <div className="mt-auto">
          <div className="border-t border-[var(--border-subtle)] mx-4" />
          <div className="px-6 pt-4 pb-4">
            <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">
              Coming up
            </p>
            <div className="space-y-2.5">
              {nextBlocks.map((block, i) => {
                const color = block.roleColor || "#706c65";
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

      {/* Logout */}
      <div className={cn("pb-4", collapsed ? "px-1.5" : "px-3")}>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "group relative flex items-center rounded-lg w-full text-[var(--sidebar-text)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-hover)] transition-all duration-200",
            collapsed ? "justify-center py-2.5 px-0" : "gap-3 py-2.5 px-4 border-l-2 border-transparent"
          )}
        >
          <LogOut className="h-5 w-5 opacity-60 shrink-0" />
          {!collapsed && <span className="text-[16px]">Sign out</span>}
          {collapsed && (
            <span className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg z-50">
              Sign out
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
