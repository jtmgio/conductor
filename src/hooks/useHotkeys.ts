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
        // Punctuation carries its own shift state: "?" cannot be produced
        // without Shift, so requiring needsShift === hasShift meant the
        // shortcuts sheet could never be opened by its own shortcut.
        const shiftIsImplicit = s.key.length === 1 && !/[a-z0-9]/i.test(s.key);
        if (!shiftIsImplicit && needsShift !== hasShift) continue;
        if (needsAlt !== hasAlt) continue;

        // Match key (case-insensitive, handle special keys)
        const pressedKey = e.key.toLowerCase();
        const targetKey = s.key.toLowerCase();

        // Handle number keys with Cmd (e.key returns "1", "2", etc.)
        if (pressedKey === targetKey || (targetKey === "," && pressedKey === ",")) {
          e.preventDefault();
          // Don't stopPropagation for Escape — multiple overlays may need to handle it
          if (pressedKey !== "escape") e.stopPropagation();
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

/**
 * What the shortcuts sheet shows.
 *
 * This list used to be hand-maintained and had drifted badly: it documented
 * ⌘2 as Inbox and ⌘4 as Board when the app binds ⌘2 to Board and ⌘4 to
 * Formatter — exactly inverted — and 14 of its 22 entries were for features
 * that were never built. Combined with "?" never matching (see the shift fix
 * above), the help was both wrong and unopenable.
 *
 * AppShell now passes its live `shortcuts` array to KeyboardShortcuts, so the
 * sheet renders what is actually bound. What remains here is only the set of
 * bindings owned by other components, which the sheet cannot introspect.
 */
export const EXTERNAL_SHORTCUTS: Omit<Shortcut, "action">[] = [
  { key: "k", modifiers: ["cmd"], description: "Search", category: "Navigation" },
  { key: "Enter", description: "Send message", category: "AI Chat", allowInInput: true },
  { key: "Enter", modifiers: ["shift"], description: "New line", category: "AI Chat", allowInInput: true },
  { key: "/", description: "Slash commands", category: "AI Chat", allowInInput: true },
  { key: "Enter", modifiers: ["cmd"], description: "Start the next block", category: "Focus" },
];
