"use client";

import { AppShell } from "@/components/AppShell";
import { Keyboard } from "lucide-react";

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  label: string;
  shortcuts: Shortcut[];
}

const groups: ShortcutGroup[] = [
  {
    label: "Global",
    shortcuts: [
      { keys: ["n"], description: "Quick add a new task" },
      { keys: ["⌘", "K"], description: "Open global search" },
      { keys: ["Esc"], description: "Close dialogs, search, or quick add" },
    ],
  },
  {
    label: "Focus View",
    shortcuts: [
      { keys: ["Click", "checkbox"], description: "Complete a task" },
      { keys: ["Click", "title"], description: "Expand task details" },
      { keys: ["Right-click", "task"], description: "Toggle task details" },
      { keys: ["Drag"], description: "Reorder tasks" },
    ],
  },
  {
    label: "Task Details",
    shortcuts: [
      { keys: ["Enter"], description: "Save title edit" },
      { keys: ["Tab"], description: "Move between fields" },
      { keys: ["Enter"], description: "Add checklist item (in checklist input)" },
    ],
  },
  {
    label: "AI Chat",
    shortcuts: [
      { keys: ["Enter"], description: "Send message" },
      { keys: ["Shift", "Enter"], description: "New line in message" },
    ],
  },
  {
    label: "Inbox",
    shortcuts: [
      { keys: ["Enter"], description: "Submit quick-add task or follow-up" },
    ],
  },
];

export function KeysContent() {
  return (
    <div className="max-w-[680px]">
        <div className="flex items-center gap-2.5 mb-2">
          <Keyboard className="h-6 w-6 text-[var(--text-tertiary)]" />
          <h1 className="text-[32px] font-semibold text-[var(--text-primary)]">Keyboard Shortcuts</h1>
        </div>
        <p className="text-[15px] text-[var(--text-secondary)] mb-10">All the ways to move fast in Conductor.</p>

        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">{group.label}</p>
              <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl overflow-hidden divide-y divide-[var(--border-subtle)]">
                {group.shortcuts.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-[15px] text-[var(--text-primary)]">{shortcut.description}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-4">
                      {shortcut.keys.map((key, j) => (
                        <span key={j}>
                          {j > 0 && <span className="text-[var(--text-tertiary)] text-[12px] mx-0.5">+</span>}
                          <kbd className="inline-flex items-center justify-center min-w-[28px] px-2 py-1 text-[13px] font-mono font-medium text-[var(--accent-blue)] bg-[var(--surface)] border border-[var(--border-default)] rounded-lg">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
    </div>
  );
}

export function KeysPage() {
  return (
    <AppShell>
      <div className="py-6">
        <KeysContent />
      </div>
    </AppShell>
  );
}
