"use client";

import { Sun, Moon, Monitor } from "lucide-react";
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
    <div className="space-y-4">
      {/* Theme */}
      <div>
        <p className="text-[13px] text-[var(--text-tertiary)] mb-2">Theme</p>
        <div className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
          {themes.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
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
      </div>

      {/* Zoom */}
      <div>
        <p className="text-[13px] text-[var(--text-tertiary)] mb-2">Text size</p>
        <div className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
          {zooms.map((z) => {
            const active = zoom === z.id;
            return (
              <button
                key={z.id}
                onClick={() => setZoom(z.id)}
                className={cn(
                  "px-5 py-2 rounded-lg text-[13px] font-medium transition-all",
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
    </div>
  );
}
