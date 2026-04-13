"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Role { id: string; name: string; color: string; }
interface ScheduleBlock {
  id: string;
  label: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  sortOrder: number;
  dayAssignments: Record<string, string> | null;
}

const DAYS = [
  { label: "Mon", value: "1" },
  { label: "Tue", value: "2" },
  { label: "Wed", value: "3" },
  { label: "Thu", value: "4" },
  { label: "Fri", value: "5" },
];

const TIME_OPTIONS: Array<{ h: number; m: number; label: string }> = [];
for (let h = 5; h <= 23; h++) {
  for (const m of [0, 30]) {
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const label = m === 0 ? `${hour}:00 ${suffix}` : `${hour}:30 ${suffix}`;
    TIME_OPTIONS.push({ h, m, label });
  }
}

function formatTimeShort(h: number, m: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

interface ScheduleGridProps { roles: Role[]; }

export function ScheduleGrid({ roles }: ScheduleGridProps) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ScheduleBlock>>({});

  const fetchBlocks = useCallback(() => {
    fetch("/api/schedule/blocks")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setBlocks(data); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  const roleMap = Object.fromEntries(roles.map((r) => [r.id, r]));

  const updateDayAssignment = async (blockId: string, day: string, roleId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const newAssignments = { ...(block.dayAssignments || {}), [day]: roleId };
    await fetch("/api/schedule/blocks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: blockId, dayAssignments: newAssignments }),
    });
    fetchBlocks();
  };

  const startEdit = (block: ScheduleBlock) => {
    setEditingId(block.id);
    setEditForm({ label: block.label, startHour: block.startHour, startMinute: block.startMinute, endHour: block.endHour, endMinute: block.endMinute });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await fetch("/api/schedule/blocks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, ...editForm }),
    });
    setEditingId(null);
    fetchBlocks();
  };

  const deleteBlock = async (id: string) => {
    await fetch("/api/schedule/blocks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchBlocks();
  };

  const addBlock = async () => {
    const last = blocks[blocks.length - 1];
    const startH = last ? last.endHour : 9;
    const startM = last ? last.endMinute : 0;
    await fetch("/api/schedule/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "New Block",
        startHour: startH,
        startMinute: startM,
        endHour: Math.min(startH + 2, 23),
        endMinute: 0,
        dayAssignments: {},
      }),
    });
    fetchBlocks();
  };

  if (blocks.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-[13px] text-[var(--text-tertiary)] mb-3">No schedule blocks configured yet.</p>
        <button onClick={addBlock} className="flex items-center gap-1.5 mx-auto text-[13px] text-[var(--accent-blue)] hover:text-[var(--text-primary)]">
          <Plus className="h-3.5 w-3.5" /> Add first block
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Header row */}
      <div className="grid grid-cols-[minmax(160px,1fr)_repeat(5,1fr)_40px] gap-1 text-[11px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider pb-2">
        <div className="px-2">Block</div>
        {DAYS.map((d) => <div key={d.value} className="text-center">{d.label}</div>)}
        <div />
      </div>

      {/* Block rows */}
      {blocks.map((block) => {
        const assignments = block.dayAssignments || {};
        const isEditing = editingId === block.id;

        return (
          <div key={block.id} className="grid grid-cols-[minmax(160px,1fr)_repeat(5,1fr)_40px] gap-1 items-center py-2 border-t border-[var(--border-subtle)] group">
            {/* Block label + time */}
            <div className="px-2">
              {isEditing ? (
                <div className="space-y-1.5">
                  <input
                    value={editForm.label || ""}
                    onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                    className="w-full text-[13px] bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-[var(--text-primary)]"
                  />
                  <div className="flex items-center gap-1 text-[11px]">
                    <select
                      value={`${editForm.startHour}:${editForm.startMinute}`}
                      onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setEditForm({ ...editForm, startHour: h, startMinute: m }); }}
                      className="bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded px-1 py-0.5 text-[var(--text-secondary)]"
                    >
                      {TIME_OPTIONS.map((t) => <option key={`${t.h}:${t.m}`} value={`${t.h}:${t.m}`}>{t.label}</option>)}
                    </select>
                    <span className="text-[var(--text-tertiary)]">to</span>
                    <select
                      value={`${editForm.endHour}:${editForm.endMinute}`}
                      onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setEditForm({ ...editForm, endHour: h, endMinute: m }); }}
                      className="bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded px-1 py-0.5 text-[var(--text-secondary)]"
                    >
                      {TIME_OPTIONS.map((t) => <option key={`${t.h}:${t.m}`} value={`${t.h}:${t.m}`}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={saveEdit} className="p-1 rounded hover:bg-green-500/10 text-green-400"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-red-500/10 text-red-400"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => startEdit(block)} className="text-left w-full group/label">
                  <div className="text-[13px] text-[var(--text-secondary)] font-medium group-hover/label:text-[var(--text-primary)] flex items-center gap-1.5">
                    {block.label}
                    <Pencil className="h-3 w-3 text-[var(--text-tertiary)] opacity-0 group-hover/label:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)]">
                    {formatTimeShort(block.startHour, block.startMinute)}–{formatTimeShort(block.endHour, block.endMinute)}
                  </div>
                </button>
              )}
            </div>

            {/* Day assignments */}
            {DAYS.map((day) => {
              const roleId = assignments[day.value] || "";
              const role = roleId ? roleMap[roleId] : null;
              return (
                <div key={day.value} className="flex justify-center">
                  <select
                    value={roleId}
                    onChange={(e) => updateDayAssignment(block.id, day.value, e.target.value)}
                    className={cn(
                      "w-full max-w-[130px] text-[10px] font-medium rounded-full px-2 py-1 text-center appearance-none cursor-pointer border transition-colors",
                      role
                        ? "border-transparent"
                        : "border-dashed border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:border-[var(--border-default)]"
                    )}
                    style={role ? { backgroundColor: `${role.color}1a`, color: role.color } : undefined}
                  >
                    <option value="">—</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}

            {/* Delete button */}
            <div className="flex justify-center">
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Add block button */}
      <div className="pt-3 border-t border-[var(--border-subtle)]">
        <button
          onClick={addBlock}
          className="flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add time block
        </button>
      </div>
    </div>
  );
}
