"use client";

import { useState, useCallback } from "react";

const MIN = 13;
const MAX = 19;
const DEFAULT = 15;

export function useFontSize(key: string) {
  const [size, setSize] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT;
    const stored = localStorage.getItem(`conductor-font-${key}`);
    return stored ? Math.min(MAX, Math.max(MIN, parseInt(stored, 10))) : DEFAULT;
  });

  const increase = useCallback(() => {
    setSize((prev) => {
      const next = Math.min(MAX, prev + 1);
      localStorage.setItem(`conductor-font-${key}`, String(next));
      return next;
    });
  }, [key]);

  const decrease = useCallback(() => {
    setSize((prev) => {
      const next = Math.max(MIN, prev - 1);
      localStorage.setItem(`conductor-font-${key}`, String(next));
      return next;
    });
  }, [key]);

  return { size, increase, decrease, atMin: size <= MIN, atMax: size >= MAX };
}
