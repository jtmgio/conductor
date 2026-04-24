"use client";

import { useState, useCallback } from "react";

export interface RefinedTask {
  title: string;
  notes: string | null;
  checklist: Array<{ text: string; done: boolean }> | null;
  priority: "normal" | "urgent";
  dueDate: string | null;
}

interface UseTaskRefineReturn {
  state: "idle" | "refining" | "preview";
  refined: RefinedTask | null;
  rawText: string;
  refine: (rawText: string, roleId: string) => Promise<void>;
  updateField: <K extends keyof RefinedTask>(field: K, value: RefinedTask[K]) => void;
  reset: () => void;
}

export function useTaskRefine(): UseTaskRefineReturn {
  const [state, setState] = useState<"idle" | "refining" | "preview">("idle");
  const [refined, setRefined] = useState<RefinedTask | null>(null);
  const [rawText, setRawText] = useState("");

  const refine = useCallback(async (text: string, roleId: string) => {
    setRawText(text);
    setState("refining");

    try {
      const res = await fetch("/api/tasks/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: text, roleId }),
      });

      const data = await res.json();

      if (res.ok && data.refined) {
        // Validate title is actually shorter than the input
        const refinedTitle = data.refined.title || text;
        if (refinedTitle.length > 80 && text.length > 80) {
          // AI didn't shorten it — force truncation with ellipsis
          data.refined.title = text.slice(0, 60).replace(/\s+\S*$/, "") + "...";
          data.refined.notes = data.refined.notes || text;
        }
        setRefined(data.refined);
        setState("preview");
      } else {
        // API error — still go to preview with raw text so user can edit
        setRefined({ title: text.length > 80 ? text.slice(0, 60).replace(/\s+\S*$/, "") + "..." : text, notes: text.length > 80 ? text : null, checklist: null, priority: "normal", dueDate: null });
        setState("preview");
      }
    } catch {
      // Network error — still go to preview with raw text so user can edit
      setRefined({ title: text.length > 80 ? text.slice(0, 60).replace(/\s+\S*$/, "") + "..." : text, notes: text.length > 80 ? text : null, checklist: null, priority: "normal", dueDate: null });
      setState("preview");
    }
  }, []);

  const updateField = useCallback(<K extends keyof RefinedTask>(field: K, value: RefinedTask[K]) => {
    setRefined((prev) => prev ? { ...prev, [field]: value } : prev);
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setRefined(null);
    setRawText("");
  }, []);

  return { state, refined, rawText, refine, updateField, reset };
}
