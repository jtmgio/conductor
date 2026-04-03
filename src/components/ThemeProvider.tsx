"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "warm-dark" | "dark";
export type ZoomLevel = "small" | "default" | "large" | "xl";

const ZOOM_VALUES: Record<ZoomLevel, number> = {
  small: 0.9,
  default: 1,
  large: 1.1,
  xl: 1.2,
};

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  zoom: ZoomLevel;
  setZoom: (zoom: ZoomLevel) => void;
}>({ theme: "warm-dark", setTheme: () => {}, zoom: "default", setZoom: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("warm-dark");
  const [zoom, setZoomState] = useState<ZoomLevel>("default");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem("conductor-theme") as Theme | null;
    if (storedTheme && ["light", "warm-dark", "dark"].includes(storedTheme)) {
      setThemeState(storedTheme);
      document.documentElement.setAttribute("data-theme", storedTheme);
    }

    const storedZoom = localStorage.getItem("conductor-zoom") as ZoomLevel | null;
    if (storedZoom && storedZoom in ZOOM_VALUES) {
      setZoomState(storedZoom);
      document.documentElement.style.zoom = String(ZOOM_VALUES[storedZoom]);
    }

    setMounted(true);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("conductor-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  const setZoom = (z: ZoomLevel) => {
    setZoomState(z);
    localStorage.setItem("conductor-zoom", z);
    document.documentElement.style.zoom = String(ZOOM_VALUES[z]);
  };

  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, zoom, setZoom }}>
      {children}
    </ThemeContext.Provider>
  );
}
