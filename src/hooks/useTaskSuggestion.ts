"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";

export interface TaskSuggestion {
  taskId: string;
  taskTitle: string;
  loading: boolean;
  data: Record<string, unknown> | null;
}

export function useTaskSuggestion() {
  const [suggestion, setSuggestion] = useState<TaskSuggestion | null>(null);
  const { toast } = useToast();

  const requestSuggestion = (taskId: string, taskTitle: string, roleId: string) => {
    setSuggestion({ taskId, taskTitle, loading: true, data: null });
    fetch("/api/tasks/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: taskTitle, roleId }),
    })
      .then((r) => r.json())
      .then((d) => {
        const s = d.suggestions || {};
        if (Object.keys(s).length === 0) {
          setSuggestion(null);
        } else {
          setSuggestion({ taskId, taskTitle, loading: false, data: s });
        }
      })
      .catch(() => setSuggestion(null));
  };

  const applyTaskSuggestion = async (taskId: string, data: Record<string, unknown>) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      toast("Failed to update task", "error");
    }
  };

  const dismissSuggestion = () => setSuggestion(null);

  return { suggestion, setSuggestion, requestSuggestion, applyTaskSuggestion, dismissSuggestion };
}
