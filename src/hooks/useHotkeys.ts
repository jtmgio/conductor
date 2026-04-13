import { useEffect, useCallback } from "react";

export interface Shortcut {
  key: string;
  modifiers?: ("cmd" | "shift" | "alt")[];
  action: () => void;
  description: string;
  category: string;
  allowInInput?: boolean;
}

export function useHotkeys(shortcuts: Shortcut[]) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable;

      for (const s of shortcuts) {
        if (isInput && !s.allowInInput) continue;

        const needsCmd = s.modifiers?.includes("cmd") ?? false;
        const needsShift = s.modifiers?.includes("shift") ?? false;
        const needsAlt = s.modifiers?.includes("alt") ?? false;

        const hasCmd = e.metaKey || e.ctrlKey;
        const hasShift = e.shiftKey;
        const hasAlt = e.altKey;

        if (needsCmd !== hasCmd) continue;
        if (needsShift !== hasShift) continue;
        if (needsAlt !== hasAlt) continue;

        // Match key (case-insensitive, handle special keys)
        const pressedKey = e.key.toLowerCase();
        const targetKey = s.key.toLowerCase();

        // Handle number keys with Cmd (e.key returns "1", "2", etc.)
        if (pressedKey === targetKey || (targetKey === "," && pressedKey === ",")) {
          e.preventDefault();
          e.stopPropagation();
          s.action();
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [handler]);
}

// All shortcuts defined in one place for the overlay to reference
export const SHORTCUT_DEFINITIONS: Omit<Shortcut, "action">[] = [
  // Navigation
  { key: "1", modifiers: ["cmd"], description: "Go to Focus", category: "Navigation" },
  { key: "2", modifiers: ["cmd"], description: "Go to Inbox", category: "Navigation" },
  { key: "3", modifiers: ["cmd"], description: "Go to Tracker", category: "Navigation" },
  { key: "4", modifiers: ["cmd"], description: "Go to Board", category: "Navigation" },
  { key: "5", modifiers: ["cmd"], description: "Go to AI", category: "Navigation" },
  { key: "6", modifiers: ["cmd"], description: "Go to Documents", category: "Navigation" },
  { key: "7", modifiers: ["cmd"], description: "Go to Drafts", category: "Navigation" },
  { key: ",", modifiers: ["cmd"], description: "Go to Settings", category: "Navigation" },
  { key: "k", modifiers: ["cmd"], description: "Search", category: "Navigation" },

  // Create
  { key: "n", description: "Quick add task", category: "Create" },
  { key: "n", modifiers: ["cmd"], description: "New task", category: "Create" },
  { key: "n", modifiers: ["cmd", "shift"], description: "New follow-up", category: "Create" },

  // Focus View
  { key: "[", description: "Previous time block", category: "Focus" },
  { key: "]", description: "Next time block", category: "Focus" },
  { key: "l", modifiers: ["cmd"], description: "Toggle list / board view", category: "Focus" },

  // Task Actions
  { key: "Enter", modifiers: ["cmd"], description: "Complete selected task", category: "Tasks" },
  { key: "t", modifiers: ["cmd"], description: "Mark as Today", category: "Tasks" },
  { key: "Escape", description: "Close dialog / deselect", category: "Tasks" },

  // AI Chat
  { key: "Enter", description: "Send message", category: "AI Chat", allowInInput: true },
  { key: "Enter", modifiers: ["shift"], description: "New line", category: "AI Chat", allowInInput: true },
  { key: "/", description: "Slash commands", category: "AI Chat", allowInInput: true },

  // General
  { key: "?", description: "Show keyboard shortcuts", category: "General" },
];
