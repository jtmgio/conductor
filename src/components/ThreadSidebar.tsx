"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, MessageSquare, MoreVertical, Pencil, Trash2, Eraser, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

export interface Thread {
  id: string;
  name: string;
  isDefault: boolean;
  messageCount: number;
  updatedAt: string;
}

interface ThreadSidebarProps {
  threads: Thread[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  onCreateThread: (name: string) => Promise<void>;
  onRenameThread: (threadId: string, name: string) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
  onClearThread: (threadId: string) => Promise<void>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  onRenameThread,
  onDeleteThread,
  onClearThread,
  collapsed,
  onToggleCollapsed,
}: ThreadSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating && createInputRef.current) createInputRef.current.focus();
  }, [creating]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) renameInputRef.current.focus();
  }, [renamingId]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) { setCreating(false); return; }
    await onCreateThread(trimmed);
    setNewName("");
    setCreating(false);
  };

  const handleRename = async (threadId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingId(null); return; }
    await onRenameThread(threadId, trimmed);
    setRenamingId(null);
  };

  // Sort: default thread first, then by updatedAt desc
  const sorted = [...threads].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-2 w-10 shrink-0 border-r border-[var(--border-subtle)]">
        <button
          onClick={onToggleCollapsed}
          className="w-8 h-8 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          title="Show threads"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        {threads.length > 1 && (
          <span className="text-[11px] text-[var(--text-tertiary)] mt-1">{threads.length}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-[220px] shrink-0 border-r border-[var(--border-subtle)] min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0">
        <span className="text-[13px] font-medium text-[var(--text-secondary)]">Threads</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setCreating(true); setNewName(""); }}
            className="w-7 h-7 rounded-md hover:bg-[var(--sidebar-hover)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            title="New thread"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onToggleCollapsed}
            className="w-7 h-7 rounded-md hover:bg-[var(--sidebar-hover)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            title="Collapse"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* New thread input */}
      {creating && (
        <div className="px-2 pb-2">
          <input
            ref={createInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            onBlur={handleCreate}
            placeholder="Thread name..."
            maxLength={50}
            className="w-full px-2.5 py-1.5 rounded-lg text-[13px] bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 placeholder:text-[var(--text-tertiary)]"
          />
        </div>
      )}

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-1.5 hide-scrollbar">
        {sorted.map((thread) => {
          const active = thread.id === activeThreadId;

          if (renamingId === thread.id) {
            return (
              <div key={thread.id} className="px-1.5 py-1">
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(thread.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => handleRename(thread.id)}
                  maxLength={50}
                  className="w-full px-2.5 py-1.5 rounded-lg text-[13px] bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20"
                />
              </div>
            );
          }

          return (
            <div
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              className={cn(
                "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors mb-0.5",
                active
                  ? "bg-[var(--sidebar-hover)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{thread.name}</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {thread.messageCount > 0 ? `${Math.floor(thread.messageCount / 2)} messages` : "Empty"}{" "}
                  · {timeAgo(thread.updatedAt)}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/5 transition-all"
                  >
                    <MoreVertical className="h-3 w-3 text-[var(--text-tertiary)]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[140px]">
                  {!thread.isDefault && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(thread.id);
                        setRenameValue(thread.name);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Rename
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearThread(thread.id);
                    }}
                  >
                    <Eraser className="h-3.5 w-3.5 mr-2" />
                    Clear messages
                  </DropdownMenuItem>
                  {!thread.isDefault && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteThread(thread.id);
                      }}
                      className="text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
