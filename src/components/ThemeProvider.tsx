"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "warm-dark" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({ theme: "warm-dark", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("warm-dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("conductor-theme") as Theme | null;
    if (stored && ["light", "warm-dark", "dark"].includes(stored)) {
      setThemeState(stored);
      document.documentElement.setAttribute("data-theme", stored);
    }
    setMounted(true);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("conductor-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  // Prevent flash — apply theme before first paint via inline script won't work
  // in Next.js app router easily, so we set it in useEffect above.
  // The default CSS (:root) matches warm-dark, so no flash for default users.

  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
