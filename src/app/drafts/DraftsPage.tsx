"use client";

import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Send, Copy, Trash2, Edit2, FileText, Check, X } from "lucide-react";

interface Role {
  id: string;
  name: string;
  color: string;
}

interface Draft {
  id: string;
  roleId: string;
  recipientName: string | null;
  platform: string | null;
  content: string;
  status: string;
  createdAt: string;
  role: Role;
}

export function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const [draftsRes, rolesRes] = await Promise.all([
          fetch("/api/drafts"),
          fetch("/api/roles"),
        ]);
        const draftsData = await draftsRes.json();
        const rolesData = await rolesRes.json();
        setDrafts(Array.isArray(draftsData) ? draftsData : []);
        setRoles(Array.isArray(rolesData) ? rolesData : []);
      } catch {
        // silent
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editingId]);

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast("Copied to clipboard", "success");
    } catch {
      toast("Failed to copy", "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/drafts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      toast("Draft deleted", "success");
    } catch {
      toast("Failed to delete draft", "error");
    }
  };

  const handleEditStart = (draft: Draft) => {
    setEditingId(draft.id);
    setEditContent(draft.content);
  };

  const handleEditSave = async (id: string) => {
    try {
      const res = await fetch(`/api/drafts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, content: updated.content } : d)));
      setEditingId(null);
      toast("Draft updated", "success");
    } catch {
      toast("Failed to update draft", "error");
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditContent("");
  };

  const filtered = drafts.filter((d) => {
    if (filter === "all") return true;
    return d.roleId === filter;
  });

  const grouped = filtered.reduce<Record<string, Draft[]>>((acc, d) => {
    if (!acc[d.roleId]) acc[d.roleId] = [];
    acc[d.roleId].push(d);
    return acc;
  }, {});

  const orderedGroups = roles
    .filter((r) => grouped[r.id])
    .map((r) => ({ role: r, items: grouped[r.id] }));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <AppShell>
      <div className="py-6">
        <div className="flex items-center gap-3 mb-1">
          <Send className="w-7 h-7 text-[var(--text-primary)]" />
          <h1 className="text-[32px] font-semibold text-[var(--text-primary)]">Draft Queue</h1>
        </div>
        <p className="text-[15px] text-[var(--text-tertiary)] mb-6">AI-drafted messages saved for review. Edit, copy, or discard before sending.</p>

        <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1 mb-8">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "px-4 py-1.5 rounded-full text-[15px] font-medium whitespace-nowrap transition-colors shrink-0",
              filter === "all"
                ? "bg-[var(--accent-blue)] text-white"
                : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
            )}
          >
            All
          </button>
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setFilter(role.id)}
              className={cn(
                "px-4 py-1.5 rounded-full text-[15px] font-medium whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5",
                filter === role.id
                  ? "bg-[var(--accent-blue)] text-white"
                  : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
              )}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: filter === role.id ? "white" : role.color }}
              />
              {role.name}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--text-tertiary)] opacity-40" />
            <p className="text-[var(--text-tertiary)] text-sm">
              No drafts yet — draft messages in AI chat and save them here.
            </p>
          </div>
        )}

        <div className="space-y-8">
          {orderedGroups.map(({ role, items }) => (
            <div key={role.id}>
              <div className="mb-3">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold"
                  style={{ backgroundColor: `${role.color}1a`, color: role.color }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: role.color }}
                  />
                  {role.name}
                </span>
              </div>
              <div className="space-y-2.5">
                <AnimatePresence>
                  {items.map((draft) => (
                    <motion.div
                      key={draft.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {draft.recipientName && (
                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                              To: {draft.recipientName}
                            </span>
                          )}
                          {draft.platform && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                              {draft.platform}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap shrink-0">
                          {formatDate(draft.createdAt)}
                        </span>
                      </div>

                      {editingId === draft.id ? (
                        <div className="mb-3">
                          <textarea
                            ref={editRef}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full min-h-[100px] p-3 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] resize-y focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleEditSave(draft.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-blue)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                            >
                              <Check className="w-3.5 h-3.5" /> Save
                            </button>
                            <button
                              onClick={handleEditCancel}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] text-xs font-medium hover:bg-[var(--sidebar-hover)] transition-colors"
                            >
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap mb-3 line-clamp-4">
                          {draft.content}
                        </p>
                      )}

                      {editingId !== draft.id && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleCopy(draft.content)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" /> Copy
                          </button>
                          <button
                            onClick={() => handleEditStart(draft)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(draft.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
