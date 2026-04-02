"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Role { id: string; name: string; color: string; }

export function QuickEntry() {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/roles").then((r) => r.json()).then((data) => {
      const arr = Array.isArray(data) ? data : [];
      setRoles(arr);
      if (arr.length > 0) setRoleId(arr[0].id);
    }).catch(() => {});
  }, []);

  // Keyboard shortcut: 'n' to open (when not in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "n" && !open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSave = async () => {
    if (!title.trim() || !roleId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId,
          title: title.trim(),
          isToday: true,
          dueDate: dueDate || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast("Task added", "success");
      setTitle("");
      setDueDate("");
      setOpen(false);
    } catch {
      toast("Failed to add task", "error");
    }
    setSaving(false);
  };

  const selectedRole = roles.find((r) => r.id === roleId);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-2xl bg-[var(--accent-blue)] text-white flex items-center justify-center shadow-lg hover:opacity-90 active:scale-95 transition-all lg:bottom-8 lg:right-8"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Dialog */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-[480px] bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-2xl p-4 shadow-xl lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Quick add</h3>
                <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center justify-center">
                  <X className="h-4 w-4 text-[var(--text-tertiary)]" />
                </button>
              </div>

              <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Task title..."
                className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-[15px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 mb-3 placeholder:text-[var(--text-tertiary)]"
              />

              <div className="flex gap-2 mb-4">
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger className="flex-1 rounded-xl border-[var(--border-subtle)] bg-[var(--surface)] h-10 text-[14px] text-[var(--text-primary)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                          {role.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={!title.trim() || saving}
                className="w-full py-2.5 rounded-xl text-white font-medium text-[14px] transition-all hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: selectedRole?.color || "var(--accent-blue)" }}
              >
                {saving ? "Adding..." : "Add task"}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
