"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crosshair, Columns3, ListChecks, Send, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The phone tab bar.
 *
 * CLAUDE.md has described this file for a long time — "Mobile-first: bottom nav
 * via MobileDrawer" — but it didn't exist. Mobile navigation was a hamburger
 * that opened a bottom sheet, so *every* move between pages cost two taps, and
 * nothing on screen said what the other pages were.
 *
 * Five destinations, one tap. Settings stays in the drawer: it's a place you go
 * occasionally, and a sixth tab would push the labels below legibility.
 */
const TABS = [
  { href: "/", label: "Today", icon: Crosshair },
  { href: "/board", label: "Board", icon: Columns3 },
  { href: "/tracker", label: "Tracker", icon: ListChecks },
  { href: "/formatter", label: "Format", icon: Send },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn(
        "lg:hidden fixed bottom-0 left-0 right-0 z-40",
        "grid grid-cols-5 border-t border-[var(--border-subtle)] bg-[var(--sidebar-bg)]",
        // Clear of the home indicator on a notched phone.
        "pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      )}
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 44px minimum target, per the app's own rule.
              "flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 transition-colors",
              active ? "text-[var(--primary)]" : "text-[var(--text-tertiary)]"
            )}
          >
            <tab.icon className="h-[19px] w-[19px]" />
            <span className="text-[10px] leading-none">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
