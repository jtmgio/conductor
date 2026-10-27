"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, FolderKanban, Flame, Loader2 } from "lucide-react";
import { TaskDetailDrawer, type DrawerTask } from "@/components/TaskDetailDrawer";
import { TaskKeyChip } from "@/components/TaskKeyChip";
import { useToast } from "@/components/ui/toast";
import { groupBoard } from "@/lib/board-groups";
import { cn } from "@/lib/utils";

type Horizon = "today" | "week" | "all";

interface BoardRow extends DrawerTask {
  key: string;
  role: DrawerTask["role"] & { priority: number };
  project: { id: string; name: string } | null;
  blockedReason?: string | null;
}

interface StuckRow extends BoardRow {
  reason: "blocked" | "pastDue" | "idle";
  days: number | null;
}

interface WaitingRow {
  id: string;
  title: string;
  waitingOn: string;
  role: string;
  roleColor: string;
  daysWaiting: number;
}

interface BoardResponse {
  date: string;
  board: BoardRow[];
  more: boolean;
  stuck: StuckRow[];
  waitingOnReview: BoardRow[];
  waitingOn: WaitingRow[];
}

interface Company {
  id: string;
  name: string;
  color: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface Chip {
  value: string | null;
  label: string;
  color?: string;
}

const HORIZONS: [Horizon, string][] = [["today", "Today"], ["week", "Week"], ["all", "All"]];

const SECTION_LABEL = "text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2";

/** "2026-10-24" (or a full ISO stamp after a PUT merge) → "Oct 24", read as a local date. */
function formatDue(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function stuckNote(row: StuckRow): string {
  if (row.reason === "pastDue") return "past due";
  if (row.reason === "idle") return row.days !== null ? `idle ${plural(row.days, "day")}` : "idle";
  return row.days !== null ? `blocked ${plural(row.days, "day")}` : "blocked";
}

function Segmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map(([v, label]) => {
        const selected = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className="text-[13px] font-medium px-3 py-1 rounded-full transition-all"
            style={{
              background: selected ? "var(--surface)" : "transparent",
              color: selected ? "var(--text-primary)" : "var(--text-tertiary)",
              border: selected ? "none" : "1px solid var(--border-subtle)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One pill that opens a type-ahead list — the chip rows for ten companies took half the page.
 * Single-select; null is "all". Enter picks the first match, Escape closes.
 */
function Picker({ placeholder, options, value, onChange }: { placeholder: string; options: Chip[]; value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The list is 256px wide; a pill near the right edge opens it leftward so the page never scrolls sideways.
  const [alignRight, setAlignRight] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;
  const shown = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const pick = (v: string | null) => { onChange(v); setOpen(false); setQuery(""); };

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => {
          const left = root.current?.getBoundingClientRect().left ?? 0;
          setAlignRight(left + 256 + 16 > window.innerWidth);
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1 rounded-full transition-all"
        style={{
          background: selected ? "var(--surface)" : "transparent",
          color: selected ? "var(--text-primary)" : "var(--text-tertiary)",
          border: selected ? "none" : "1px solid var(--border-subtle)",
        }}
      >
        {selected?.color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />}
        {selected ? selected.label : placeholder}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        <div
          className={cn("absolute top-full z-20 mt-1 w-64 rounded-lg border p-1 shadow-lg", alignRight ? "right-0" : "left-0")}
          style={{ background: "var(--surface-overlay)", borderColor: "var(--border-subtle)" }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setOpen(false); setQuery(""); }
              if (e.key === "Enter" && shown.length > 0) pick(shown[0].value);
            }}
            placeholder={`Type to filter ${placeholder.toLowerCase()}…`}
            className="mb-1 w-full rounded-md bg-transparent px-2 py-1.5 text-[13px] outline-none"
            style={{ color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
          />
          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {!query && (
              <li>
                <button role="option" aria-selected={value === null} onClick={() => pick(null)} className="flex min-h-[36px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-[var(--surface-raised)]" style={{ color: "var(--text-secondary)" }}>
                  <span className="w-3" />All
                </button>
              </li>
            )}
            {shown.map((o) => (
              <li key={o.value ?? "all"}>
                <button role="option" aria-selected={o.value === value} onClick={() => pick(o.value)} className="flex min-h-[36px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-[var(--surface-raised)]" style={{ color: o.value === value ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {o.value === value ? <Check className="h-3 w-3" /> : <span className="w-3" />}
                  {o.color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />}
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))}
            {query && shown.length === 0 && <li className="px-2 py-1.5 text-[13px]" style={{ color: "var(--text-tertiary)" }}>No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, note, onTick, onOpen }: { task: BoardRow; note?: string; onTick: () => void; onOpen: () => void }) {
  const due = formatDue(task.dueDate);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 60, scale: 0.97 }}
      transition={{ type: "spring", damping: 26, stiffness: 320 }}
      onClick={onOpen}
      className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl pr-3 transition-colors hover:bg-[var(--sidebar-hover)]"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onTick(); }}
        aria-label="Mark done"
        className="group/tick flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-md border-[1.75px] transition-colors"
          style={{ borderColor: `${task.role.color}88` }}
        >
          <Check className="h-3 w-3 opacity-0 transition-opacity group-hover/tick:opacity-60" style={{ color: task.role.color }} />
        </span>
      </button>
      <TaskKeyChip task={task} role={task.role} variant="inline" className="shrink-0" />
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.role.color }} />
      <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text-primary)]">{task.title}</span>
      {task.priority === "urgent" && <Flame className="h-3.5 w-3.5 shrink-0 text-red-400" aria-label="Urgent" />}
      {task.project && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)]">
          <FolderKanban className="h-3 w-3" />
          {task.project.name}
        </span>
      )}
      {note && <span className="shrink-0 text-[12px] text-[var(--text-secondary)]">{note}</span>}
      {due && <span className="shrink-0 text-[12px] text-[var(--text-tertiary)]">{due}</span>}
    </motion.div>
  );
}

function WaitingLine({ row }: { row: WaitingRow }) {
  return (
    <div className="flex min-h-[44px] items-center gap-2.5 pl-11 pr-3">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.roleColor }} />
      <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text-secondary)]">
        waiting on {row.waitingOn} for {row.title} · {plural(row.daysWaiting, "day")}
      </span>
    </div>
  );
}

export function DispatchBoard() {
  const [horizon, setHorizon] = useState<Horizon>("today");
  // Follow-ups are noise most of the time; off unless asked for, and remembered per browser.
  const [showWaiting, setShowWaiting] = useState(false);
  useEffect(() => {
    try { setShowWaiting(localStorage.getItem("board.showWaiting") === "1"); } catch {}
  }, []);
  const toggleWaiting = () =>
    setShowWaiting((v) => {
      try { localStorage.setItem("board.showWaiting", v ? "0" : "1"); } catch {}
      return !v;
    });
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Filters live in the URL so a reload or a bookmark lands on the same slice.
  const [role, setRole] = useState<string | null>(() => searchParams.get("role"));
  // The server refuses a project without a company.
  const [project, setProject] = useState<string | null>(() => (searchParams.get("role") ? searchParams.get("project") : null));
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const { toast } = useToast();
  // A slow response from an old toggle setting must not overwrite a newer one.
  const requestSeq = useRef(0);
  // Ticked tasks stay gone: a fetch that was in flight (or lands before the PUT does) still carries them.
  const doneIds = useRef(new Set<string>());

  // Background refreshes pass silent so a dropped connection doesn't toast every minute.
  const load = useCallback(async (silent = false) => {
    const seq = ++requestSeq.current;
    // Every task is Josh's to read, whoever filed it, so the board never filters by owner.
    const isDefault = horizon === "today";
    let qs: string;
    if (role) {
      // Any filter lifts the cap server-side, so "expanded" is implied.
      const params = new URLSearchParams({ horizon, role });
      if (project) params.set("project", project);
      qs = `?${params}`;
    } else {
      // A bare call is the capped view; naming the horizon lifts the cap, which is how "more" works.
      qs = isDefault ? (expanded ? "?horizon=today" : "") : `?horizon=${horizon}`;
    }
    try {
      const res = await fetch(`/api/board${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const raw: BoardResponse = await res.json();
      if (seq === requestSeq.current) {
        const alive = <T extends BoardRow>(list: T[]) => list.filter((t) => !doneIds.current.has(t.id));
        const json: BoardResponse = { ...raw, board: alive(raw.board), stuck: alive(raw.stuck), waitingOnReview: alive(raw.waitingOnReview) };
        setData(json);
        // A task the refetch dropped (hand-off, blocked, icebox) must not reopen the drawer if it comes back later.
        setDrawerTaskId((id) =>
          id && [...json.board, ...json.stuck, ...json.waitingOnReview].some((t) => t.id === id) ? id : null,
        );
      }
    } catch {
      if (seq === requestSeq.current && !silent) toast("Failed to load board", "error");
    }
    if (seq === requestSeq.current) setLoading(false);
  }, [horizon, expanded, role, project, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Claude Code sessions create and close tasks while this page sits open, so poll
  // on the same 60s cadence as the cockpit and catch up when the tab is shown again.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (!document.hidden) load(true);
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    const i = setInterval(refreshIfVisible, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      clearInterval(i);
    };
  }, [load]);

  useEffect(() => {
    fetch("/api/roles")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Company[]) => setCompanies(list.map(({ id, name, color }) => ({ id, name, color }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setProjects([]);
    if (!role) return;
    let stale = false;
    fetch(`/api/projects?roleId=${encodeURIComponent(role)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: ProjectOption[]) => { if (!stale) setProjects(list); })
      .catch(() => {});
    return () => { stale = true; };
  }, [role]);

  // replace, not push: Back shouldn't walk through every chip click.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (role) params.set("role", role);
    else params.delete("role");
    if (project) params.set("project", project);
    else params.delete("project");
    const qs = params.toString();
    if (qs === window.location.search.replace(/^\?/, "")) return;
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }, [role, project, router]);

  // A new filter blanks the list until the server answers, so the old company's rows never pass for the new one's.
  const refetching = () => { setData(null); setLoading(true); };
  const pickHorizon = (h: Horizon) => { if (h === horizon) return; refetching(); setExpanded(false); setHorizon(h); };
  // A project id belongs to one company, so changing company drops it.
  const pickRole = (r: string | null) => { if (r === role) return; refetching(); setProject(null); setRole(r); };
  const pickProject = (p: string | null) => { if (p === project) return; refetching(); setProject(p); };

  type TaskLists = Pick<BoardResponse, "board" | "stuck" | "waitingOnReview">;
  const mapTasks = (fn: <T extends BoardRow>(list: T[]) => T[]) =>
    setData((prev) =>
      prev ? { ...prev, board: fn(prev.board), stuck: fn(prev.stuck), waitingOnReview: fn(prev.waitingOnReview) } as BoardResponse : prev,
    );

  const updateTask = async (taskId: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      // The PUT response has no key or project; keep the row's own.
      mapTasks((list) => list.map((t) => (t.id === taskId ? { ...t, ...result, key: t.key, project: t.project } : t)));
      // These decide which list the row is on and where, so the server re-sorts.
      if (["dueDate", "priority", "scheduledFor", "owner"].some((k) => k in body)) load();
    } catch {
      toast("Failed to update task", "error");
    }
  };

  const changeStatus = async (taskId: string, status: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      // Status decides the section (stuck, in review), so the server re-sorts it.
      load();
    } catch {
      toast("Failed to update status", "error");
    }
  };

  const completeTask = async (taskId: string) => {
    doneIds.current.add(taskId);
    // Drop any older in-flight response; it still has this task in it.
    requestSeq.current++;
    mapTasks((list) => list.filter((t) => t.id !== taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      if (!res.ok) throw new Error();
    } catch {
      doneIds.current.delete(taskId);
      toast("Failed to complete task", "error");
      load();
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      mapTasks((list) => list.filter((t) => t.id !== taskId));
      toast("Task deleted", "success");
    } catch {
      toast("Failed to delete task", "error");
    }
  };

  const lists: TaskLists = data ?? { board: [], stuck: [], waitingOnReview: [] };
  const drawerTask: DrawerTask | null = drawerTaskId
    ? [...lists.board, ...lists.stuck, ...lists.waitingOnReview].find((t) => t.id === drawerTaskId) ?? null
    : null;

  const hasBoard = !!data && data.board.length > 0;
  const hasStuck = !!data && data.stuck.length > 0;
  const hasWaiting = showWaiting && !!data && data.waitingOn.length > 0;
  const hasReview = !!data && data.waitingOnReview.length > 0;
  const allClear = !!data && !hasBoard && !hasStuck && !hasWaiting && !hasReview;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented options={HORIZONS} value={horizon} onChange={pickHorizon} />
        {companies.length > 0 && (
          <Picker
            placeholder="Company"
            options={companies.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
            value={role}
            onChange={pickRole}
          />
        )}
        {role && (
          <Picker
            placeholder="Project"
            options={[...projects.map((p) => ({ value: p.id, label: p.name })), { value: "loose", label: "Loose" }]}
            value={project}
            onChange={pickProject}
          />
        )}
        <button
          onClick={toggleWaiting}
          aria-pressed={showWaiting}
          className="text-[13px] font-medium px-3 py-1 rounded-full transition-all"
          style={{
            background: showWaiting ? "var(--surface)" : "transparent",
            color: showWaiting ? "var(--text-primary)" : "var(--text-tertiary)",
            border: showWaiting ? "none" : "1px solid var(--border-subtle)",
          }}
        >
          Waiting on
        </button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : data ? (
        <>
          {/* Always mounted, so the last row still slides out when the list empties. */}
          <section>
            {expanded || role ? (
              // Past seven rows a flat list stops reading; group by company, then project.
              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {groupBoard(data.board).map((c) => (
                    <motion.div key={c.roleId} exit={{ opacity: 0, x: 60, scale: 0.97 }}>
                      {/* The company chip already says which company this is. */}
                      {!role && (
                        <p className={`${SECTION_LABEL} flex items-center gap-2`}>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </p>
                      )}
                      <div className="space-y-2">
                        <AnimatePresence initial={false}>
                          {c.projects.map((p) => (
                            <motion.div key={p.projectId ?? "loose"} exit={{ opacity: 0, x: 60, scale: 0.97 }}>
                              {!project && <p className={`${SECTION_LABEL} pl-11`}>{p.name ?? "loose"}</p>}
                              <AnimatePresence initial={false}>
                                {p.rows.map((t) => (
                                  <TaskRow key={t.id} task={t} onTick={() => completeTask(t.id)} onOpen={() => setDrawerTaskId(t.id)} />
                                ))}
                              </AnimatePresence>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {data.board.map((t) => (
                  <TaskRow key={t.id} task={t} onTick={() => completeTask(t.id)} onOpen={() => setDrawerTaskId(t.id)} />
                ))}
              </AnimatePresence>
            )}
            {/* A filter already returns everything. */}
            {data.more && !expanded && !role && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-1 min-h-[44px] pl-11 text-[13px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
              >
                more
              </button>
            )}
          </section>

          <AnimatePresence initial={false}>
            {hasStuck && (
              <motion.section key="stuck" exit={{ opacity: 0, x: 60, scale: 0.97 }}>
                <p className={SECTION_LABEL}>Stuck</p>
                <AnimatePresence initial={false}>
                  {data.stuck.map((t) => (
                    <TaskRow key={t.id} task={t} note={stuckNote(t)} onTick={() => completeTask(t.id)} onOpen={() => setDrawerTaskId(t.id)} />
                  ))}
                </AnimatePresence>
              </motion.section>
            )}

            {hasWaiting && (
              <motion.section key="waiting" exit={{ opacity: 0 }}>
                <p className={SECTION_LABEL}>Waiting on</p>
                {data.waitingOn.map((f) => (
                  <WaitingLine key={f.id} row={f} />
                ))}
              </motion.section>
            )}

            {hasReview && (
              <motion.section key="review" exit={{ opacity: 0, x: 60, scale: 0.97 }}>
                <p className={SECTION_LABEL}>In review</p>
                <AnimatePresence initial={false}>
                  {data.waitingOnReview.map((t) => (
                    <TaskRow key={t.id} task={t} onTick={() => completeTask(t.id)} onOpen={() => setDrawerTaskId(t.id)} />
                  ))}
                </AnimatePresence>
              </motion.section>
            )}
          </AnimatePresence>

          {allClear && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="py-6 text-[14px] text-[var(--text-tertiary)]"
            >
              Nothing needs you right now.
            </motion.p>
          )}
        </>
      ) : null}

      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setDrawerTaskId(null)}
        onUpdate={updateTask}
        onStatusChange={changeStatus}
        onComplete={completeTask}
        onDelete={deleteTask}
      />
    </div>
  );
}
