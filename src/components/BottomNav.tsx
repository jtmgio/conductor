"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Crosshair, Inbox, ListChecks, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Focus", icon: Crosshair },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/tracker", label: "Tracker", icon: ListChecks },
  { href: "/ai", label: "AI", icon: Sparkles },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      <div className="max-w-[480px] mx-auto">
        <div className="bg-[var(--sidebar-bg)] border-t border-[var(--border-subtle)]">
          <div className="flex h-14 pb-[env(safe-area-inset-bottom)]">
            {tabs.map((tab) => {
              const active =
                tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 flex-1 relative active:scale-95 transition-transform duration-200",
                    active
                      ? "text-[var(--accent-blue)]"
                      : "text-[var(--text-tertiary)]"
                  )}
                >
                  {active && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[var(--accent-blue)]" />
                  )}
                  <tab.icon className="h-5 w-5" />
                  <span className="text-[12px] font-medium mt-0.5">
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
