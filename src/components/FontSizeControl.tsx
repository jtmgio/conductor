"use client";

import { Minus, Plus } from "lucide-react";

interface FontSizeControlProps {
  size: number;
  onIncrease: () => void;
  onDecrease: () => void;
  atMin: boolean;
  atMax: boolean;
}

export function FontSizeControl({ size, onIncrease, onDecrease, atMin, atMax }: FontSizeControlProps) {
  return (
    <div className="flex items-center gap-0.5 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg">
      <button
        onClick={onDecrease}
        disabled={atMin}
        className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-30"
        title="Decrease font size"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="text-[11px] text-[var(--text-tertiary)] font-mono w-5 text-center">{size}</span>
      <button
        onClick={onIncrease}
        disabled={atMax}
        className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-30"
        title="Increase font size"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}
