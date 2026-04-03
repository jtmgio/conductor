"use client";

import { Sun, Moon, Monitor, AArrowUp } from "lucide-react";
import { useTheme, type Theme, type ZoomLevel } from "./ThemeProvider";
import { cn } from "@/lib/utils";

const themes: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "warm-dark", label: "Warm", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
];

const zooms: { id: ZoomLevel; label: string }[] = [
  { id: "small", label: "S" },
  { id: "default", label: "M" },
  { id: "large", label: "L" },
  { id: "xl", label: "XL" },
];

export function ThemeSwitcher() {
  const { theme, setTheme, zoom, setZoom } = useTheme();

  return (
    <div className="space-y-2">
      {/* Theme */}
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

      {/* Zoom */}
      <div className="flex items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
        <AArrowUp className="h-3.5 w-3.5 text-[var(--text-tertiary)] ml-1.5 shrink-0" />
        {zooms.map((z) => {
          const active = zoom === z.id;
          return (
            <button
              key={z.id}
              onClick={() => setZoom(z.id)}
              className={cn(
                "flex-1 flex items-center justify-center py-1.5 rounded-lg text-[13px] font-medium transition-all",
                active
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              {z.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
