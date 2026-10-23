"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, FolderKanban, Flame, Loader2 } from "lucide-react";
import { TaskDetailDrawer, type DrawerTask } from "@/components/TaskDetailDrawer";
import { TaskKeyChip } from "@/components/TaskKeyChip";
import { useToast } from "@/components/ui/toast";

type Horizon = "today" | "week" | "all";
type Owner = "me" | "claude" | "all";

interface BoardRow extends DrawerTask {
  key: string;
  project?: { name: string } | null;
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

const HORIZONS: [Horizon, string][] = [["today", "Today"], ["week", "Week"], ["all", "All"]];
const OWNERS: [Owner, string][] = [["me", "Mine"], ["claude", "Claude"], ["all", "Everyone"]];

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
  const [owner, setOwner] = useState<Owner>("me");
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const { toast } = useToast();
  // A slow response from an old toggle setting must not overwrite a newer one.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    const isDefault = horizon === "today" && owner === "me";
    // A bare call is the capped view; naming the horizon lifts the cap, which is how "more" works.
    const qs = isDefault ? (expanded ? "?horizon=today" : "") : `?horizon=${horizon}&owner=${owner}`;
    try {
      const res = await fetch(`/api/board${qs}`);
      if (!res.ok) throw new Error();
      const json: BoardResponse = await res.json();
      if (seq === requestSeq.current) setData(json);
    } catch {
      if (seq === requestSeq.current) toast("Failed to load board", "error");
    }
    if (seq === requestSeq.current) setLoading(false);
  }, [horizon, owner, expanded, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const pickHorizon = (h: Horizon) => { setExpanded(false); setHorizon(h); };
  const pickOwner = (o: Owner) => { setExpanded(false); setOwner(o); };

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
      // A hand-off can move the row out of the current owner view.
      if ("owner" in body) load();
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
    mapTasks((list) => list.filter((t) => t.id !== taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      if (!res.ok) throw new Error();
    } catch {
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
  const hasWaiting = !!data && data.waitingOn.length > 0;
  const hasReview = !!data && data.waitingOnReview.length > 0;
  const allClear = !!data && !hasBoard && !hasStuck && !hasWaiting && !hasReview;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented options={HORIZONS} value={horizon} onChange={pickHorizon} />
        <Segmented options={OWNERS} value={owner} onChange={pickOwner} />
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : data ? (
        <>
          {/* Always mounted, so the last row still slides out when the list empties. */}
          <section>
            <AnimatePresence initial={false}>
              {data.board.map((t) => (
                <TaskRow key={t.id} task={t} onTick={() => completeTask(t.id)} onOpen={() => setDrawerTaskId(t.id)} />
              ))}
            </AnimatePresence>
            {data.more && !expanded && (
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
