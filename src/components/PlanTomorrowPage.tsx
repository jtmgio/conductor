"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "./AppShell";
import { Check, Plus, ArrowLeft, Trash2, Sunrise, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { refineTaskInBackground } from "@/lib/capture-refine";

interface Role {
  id: string;
  name: string;
  color: string;
  active?: boolean;
}

interface Task {
  id: string;
  title: string;
  scheduledFor: string | null;
  roleId: string;
}

const ACTIVE_COMPANIES = ["vquip", "zeta", "healthmap", "healthme"];
function isActiveCompany(name: string): boolean {
  const n = name.toLowerCase();
  return ACTIVE_COMPANIES.some((a) => n.includes(a));
}

const pad = (n: number) => String(n).padStart(2, "0");
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
// The day you're about to work: if it's a weekday and the workday hasn't started
// yet (e.g. planning at 5am), that's TODAY; otherwise it's the next working day.
function computeTarget(workdayStartMin: number): { iso: string; label: string } {
  const now = new Date();
  const dow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (dow >= 1 && dow <= 5 && nowMin < workdayStartMin) {
    return { iso: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, label: "today" };
  }
  const d = new Date();
  d.setDate(d.getDate() + (dow === 5 ? 3 : dow === 6 ? 2 : 1));
  return { iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, label: d.toLocaleDateString("en-US", { weekday: "long" }) };
}

/**
 * The "line up tomorrow" page — one section per active company. Tap existing tasks
 * to schedule them for the next working day, or type new ones straight onto that day.
 */
export function PlanTomorrowPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [refining, setRefining] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(() => computeTarget(9 * 60));
  const [finishing, setFinishing] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    fetch("/api/schedule")
      .then((r) => (r.ok ? r.json() : null))
      .then((sched) => {
        const blocks = (sched?.allBlocks || []) as Array<{ startHour: number; startMinute: number }>;
        const starts = blocks.map((b) => b.startHour * 60 + b.startMinute).filter((n) => Number.isFinite(n));
        setTarget(computeTarget(starts.length ? Math.min(...starts) : 9 * 60));
      })
      .catch(() => {});
  }, []);
  const tomorrowIso = target.iso;
  const label = target.label;

  const load = useCallback(async () => {
    try {
      const [rr, tr] = await Promise.all([fetch("/api/roles"), fetch("/api/tasks")]);
      if (rr.ok) setRoles(((await rr.json()) as Role[]).filter((r) => r.active !== false));
      if (tr.ok) setTasks(await tr.json());
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("tasks-changed", onChange);
    return () => window.removeEventListener("tasks-changed", onChange);
  }, [load]);

  const isOnTomorrow = (t: Task) => !!t.scheduledFor && ymd(new Date(t.scheduledFor)) === tomorrowIso;

  const toggle = useCallback(
    async (t: Task) => {
      const on = isOnTomorrow(t);
      const next = on ? null : `${tomorrowIso}T00:00:00.000Z`;
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, scheduledFor: next } : x)));
      try {
        await fetch(`/api/tasks/${t.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledFor: on ? null : tomorrowIso }),
        });
      } catch {}
    },
    [tomorrowIso] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const addTask = useCallback(
    async (roleId: string, e: React.FormEvent) => {
      e.preventDefault();
      const text = (drafts[roleId] || "").trim();
      if (!text) return;
      setDrafts((d) => ({ ...d, [roleId]: "" }));
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId, title: text, status: "backlog", scheduledFor: tomorrowIso }),
        });
        if (res.ok) {
          const t = await res.json();
          setRefining((prev) => new Set(prev).add(t.id));
          refineTaskInBackground(
            t.id,
            text,
            roleId,
            () => load(),
            () =>
              setRefining((prev) => {
                const next = new Set(prev);
                next.delete(t.id);
                return next;
              })
          );
        }
      } catch {}
      load();
    },
    [drafts, tomorrowIso, load]
  );

  const remove = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((x) => x.id !== id));
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    } catch {}
  }, []);

  const pickedCount = tasks.filter(isOnTomorrow).length;

  // Closing move. Marks the day planned (the signal start-day gates on), then — if
  // you're planning TODAY from before your first block — shifts the whole schedule
  // earlier by however early you are, so the cockpit opens in a real block instead
  // of "Before hours". Planning tomorrow night just marks it planned.
  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await fetch("/api/tasks/plan-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: tomorrowIso, setLastPlannedFor: true }),
      });
      if (label === "today") {
        const res = await fetch("/api/schedule/start-day", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (data?.shifted) {
          const mins = Math.abs(data.shiftMinutes);
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          toast(`Day started — schedule shifted ${h > 0 ? `${h}h ${m}m` : `${m}m`} earlier`, "success");
        } else {
          toast("Day started", "success");
        }
      } else {
        toast(`${label.charAt(0).toUpperCase()}${label.slice(1)} is lined up`, "success");
      }
      window.dispatchEvent(new CustomEvent("tasks-changed"));
      router.push("/");
    } catch {
      toast("Couldn't start your day", "error");
      setFinishing(false);
    }
  }, [finishing, tomorrowIso, label, toast, router]);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl pt-1">
        <button onClick={() => router.push("/")} className="mb-4 flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
          <ArrowLeft className="h-4 w-4" />
          Back to today
        </button>

        <h1 className="text-[26px] font-bold tracking-tight text-[var(--text-primary)]">Line up {label}</h1>
        <p className="mt-1 text-[14px] text-[var(--text-tertiary)]">
          Tap a few per company, or add new ones — they&apos;ll be waiting when you land in each block {label.toLowerCase()}.
          {pickedCount > 0 && <span className="ml-1 font-medium text-[var(--text-secondary)]">{pickedCount} queued.</span>}
        </p>

        <div className="mt-6 flex flex-col gap-6">
          {/* Show your primary companies always, plus any other company you have tasks for */}
          {roles
            .filter((role) => isActiveCompany(role.name) || tasks.some((t) => t.roleId === role.id))
            .map((role) => {
            const items = tasks.filter((t) => t.roleId === role.id);
            return (
              <section key={role.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                  <h2 className="text-[15px] font-semibold" style={{ color: role.color }}>
                    {role.name}
                  </h2>
                </div>

                <div className="flex flex-col gap-1.5">
                  {items.map((t) => {
                    const on = isOnTomorrow(t);
                    return (
                      <div
                        key={t.id}
                        className="group flex min-h-[44px] items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 transition-colors hover:border-[var(--border-strong)]"
                      >
                        <button onClick={() => toggle(t)} className="flex flex-1 items-center gap-3 text-left">
                          <span
                            className={
                              on
                                ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/15"
                                : "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--border-strong)]"
                            }
                          >
                            {refining.has(t.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)]" />
                            ) : (
                              <Check className={on ? "h-3 w-3 text-emerald-400" : "h-3 w-3 text-transparent"} />
                            )}
                          </span>
                          <span className={`flex-1 text-[14px] ${on ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{t.title}</span>
                        </button>
                        <button
                          onClick={() => remove(t.id)}
                          aria-label="Delete task"
                          className="shrink-0 rounded-md p-1.5 text-[var(--text-tertiary)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Add a new task straight onto tomorrow */}
                  <form onSubmit={(e) => addTask(role.id, e)} className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] px-3.5 py-1">
                    <Plus className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                    <input
                      value={drafts[role.id] || ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [role.id]: e.target.value }))}
                      placeholder={`Add a task for ${role.name}…`}
                      className="flex-1 bg-transparent py-2.5 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                    />
                  </form>
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-8 mb-4 flex flex-col items-center gap-2">
          <button
            onClick={finish}
            disabled={finishing}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--text-primary)] px-6 py-3 text-[14px] font-semibold text-[var(--surface)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sunrise className="h-4 w-4" />}
            {label === "today" ? "Start my day" : `Done — ${label} is set`}
          </button>
          {label === "today" && (
            <p className="text-[12px] text-[var(--text-tertiary)]">
              Starting early shifts today&apos;s blocks to match.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
