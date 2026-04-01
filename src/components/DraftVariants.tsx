"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface Variant { label: string; text: string; }
interface DraftVariantsProps { variants: Variant[]; recipient?: string; onRegenerate?: () => void; }

export function DraftVariants({ variants, recipient, onRegenerate }: DraftVariantsProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const handleCopy = async (text: string, idx: number) => { await navigator.clipboard.writeText(text); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Draft variants</h2>
        {recipient && <p className="text-xs text-[var(--text-tertiary)] mt-1">To: {recipient}</p>}
      </div>
      {variants.map((variant, idx) => (
        <div key={idx} className="border border-[var(--border-subtle)] rounded-xl p-4 mb-3 bg-[var(--surface-raised)]">
          <span className="inline-block bg-[var(--surface-overlay)] text-[var(--text-secondary)] text-xs font-medium rounded-full px-2.5 py-0.5">{variant.label}</span>
          <p className="font-mono text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed mt-3">{variant.text}</p>
          <div className="flex justify-end mt-3">
            <button onClick={() => handleCopy(variant.text, idx)} className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
              {copiedIdx === idx ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
            </button>
          </div>
        </div>
      ))}
      {onRegenerate && <div className="mt-4"><button onClick={onRegenerate} className="w-full text-center text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] py-2 transition-colors">Regenerate</button></div>}
    </div>
  );
}
