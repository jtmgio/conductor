"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Check, X, ChevronDown } from "lucide-react";

interface Role {
  id: string;
  name: string;
  color: string;
  active?: boolean;
}

interface Added {
  id: string;
  title: string;
  roleName: string;
  roleColor: string;
}

/**
 * Mobile home = pure capture. Big thumb-friendly input, pick the company, add.
 * Fire-and-forget: the task files to that company's backlog and shows in a
 * "just added" list so you can see it landed (and undo). Managing the day happens
 * on the desktop cockpit — the phone is only for getting thoughts out of your head.
 */
export function MobileCapture({ currentBlock }: { currentBlock?: { roleId: string | null } | null }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [text, setText] = useState("");
  const [roleId, setRoleId] = useState("");
  const [added, setAdded] = useState<Added[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => (r.ok ? r.json() : []))
      .then((rs: Role[]) => {
        const active = rs.filter((r) => r.active !== false);
        setRoles(active);
        const preferred = currentBlock?.roleId && active.some((r) => r.id === currentBlock.roleId) ? currentBlock.roleId : active[0]?.id;
        setRoleId(preferred || "");
      })
      .catch(() => {});
  }, [currentBlock?.roleId]);

  const add = useCallback(async () => {
    const title = text.trim();
    if (!title || !roleId) return;
    setText("");
    const role = roles.find((r) => r.id === roleId);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, title, status: "backlog" }),
      });
      if (res.ok) {
        const t = await res.json();
        setAdded((a) => [{ id: t.id, title, roleName: role?.name || "", roleColor: role?.color || "#888" }, ...a].slice(0, 8));
      }
    } catch {}
    inputRef.current?.focus();
  }, [text, roleId, roles]);

  const remove = useCallback(async (id: string) => {
    setAdded((a) => a.filter((x) => x.id !== id));
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    } catch {}
  }, []);

  return (
    <div className="mx-auto max-w-md px-1 pt-4">
      <h1 className="text-[26px] font-bold tracking-tight text-[var(--text-primary)]">Capture</h1>
      <p className="mt-1 text-[14px] text-[var(--text-tertiary)]">Type it, or tap the field and use your keyboard&apos;s 🎤 to dictate.</p>

      {/* Input */}
      <div className="mt-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="What needs doing?"
          className="w-full bg-transparent py-4 text-[16px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
      </div>

      {/* Company selector */}
      <div
        className="relative mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
        style={{ borderLeft: `3px solid ${roles.find((r) => r.id === roleId)?.color || "var(--border-strong)"}` }}
      >
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="w-full appearance-none bg-transparent px-4 py-3.5 pr-10 text-[15px] font-medium text-[var(--text-primary)] outline-none"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
      </div>

      {/* Big add button */}
      <button
        onClick={add}
        disabled={!text.trim() || !roleId}
        className="mt-4 w-full rounded-2xl bg-[var(--text-primary)] py-4 text-[16px] font-semibold text-[var(--surface)] transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        Add task
      </button>

      {/* Just added */}
      {added.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Just added</p>
          <div className="flex flex-col gap-1.5">
            {added.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-3">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text-primary)]">{a.title}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11.5px]" style={{ color: a.roleColor }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: a.roleColor }} />
                  {a.roleName}
                </span>
                <button onClick={() => remove(a.id)} aria-label="Delete" className="shrink-0 rounded-md p-1 text-[var(--text-tertiary)] hover:text-red-400">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
