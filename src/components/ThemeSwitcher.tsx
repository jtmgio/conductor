"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

const themes: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "warm-dark", label: "Warm", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
      {themes.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all",
              active
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
