"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { ScheduleGrid } from "@/components/ScheduleGrid";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Settings, ChevronDown, Pencil, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface Staff { id: string; name: string; title: string; relationship?: string; commNotes?: string; email?: string; slackHandle?: string; }
interface Role { id: string; name: string; title: string; platform: string; priority: number; color: string; tone?: string; context?: string; }

const inputCls = "w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all placeholder:text-[var(--text-tertiary)]";
const textareaCls = "w-full min-h-[80px] resize-none bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all placeholder:text-[var(--text-tertiary)]";

export function SettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [staffByRole, setStaffByRole] = useState<Record<string, Staff[]>>({});
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [editTone, setEditTone] = useState<Record<string, string>>({});
  const [editContext, setEditContext] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState<Partial<Staff>>({});
  const [addingRoleId, setAddingRoleId] = useState<string | null>(null);
  const [newStaffForm, setNewStaffForm] = useState<Partial<Staff>>({});

  const fetchData = useCallback(async () => {
    try {
      const rolesRes = await fetch("/api/roles"); const rolesData = await rolesRes.json(); const arr: Role[] = Array.isArray(rolesData) ? rolesData : [];
      setRoles(arr);
      const tones: Record<string, string> = {}; const contexts: Record<string, string> = {};
      for (const r of arr) { tones[r.id] = r.tone || ""; contexts[r.id] = r.context || ""; }
      setEditTone(tones); setEditContext(contexts);
      const staffResults: Record<string, Staff[]> = {};
      await Promise.all(arr.map(async (role) => { staffResults[role.id] = await fetch(`/api/roles/${role.id}/staff`).then(r => r.json()); }));
      setStaffByRole(staffResults);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleRole = (roleId: string) => setExpandedRoleId((prev) => (prev === roleId ? null : roleId));
  const saveRole = async (roleId: string) => { setSaving(true); await fetch(`/api/roles/${roleId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tone: editTone[roleId], context: editContext[roleId] }) }); setSaving(false); };
  const openEditStaff = (roleId: string, staff: Staff) => { setEditingStaff(staff); setEditingRoleId(roleId); setStaffForm({ ...staff }); };
  const saveStaffEdit = async () => { if (!editingStaff || !editingRoleId) return; await fetch(`/api/roles/${editingRoleId}/staff/${editingStaff.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(staffForm) }); setEditingStaff(null); setEditingRoleId(null); setStaffForm({}); fetchData(); };
  const openAddStaff = (roleId: string) => { setAddingRoleId(roleId); setNewStaffForm({}); };
  const saveNewStaff = async () => { if (!addingRoleId || !newStaffForm.name || !newStaffForm.title) return; await fetch(`/api/roles/${addingRoleId}/staff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStaffForm) }); setAddingRoleId(null); setNewStaffForm({}); fetchData(); };
  const resetToday = async () => { await fetch("/api/tasks/reset-today", { method: "POST" }); };

  return (
    <AppShell>
      <div className="py-6">
        <div className="flex items-center gap-2.5 mb-8">
          <Settings className="h-6 w-6 text-[var(--text-tertiary)]" />
          <h1 className="text-[32px] font-semibold text-[var(--text-primary)]">Settings</h1>
        </div>

        <div className="space-y-2">
          {roles.map((role) => {
            const isOpen = expandedRoleId === role.id;
            const staff = staffByRole[role.id] || [];
            return (
              <div key={role.id} className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--surface-raised)]">
                <button onClick={() => toggleRole(role.id)} className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[44px] text-left hover:bg-[var(--sidebar-hover)] transition-colors">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0" style={{ backgroundColor: `${role.color}1a`, color: role.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: role.color }} />{role.name}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)] flex-1">Staff &amp; Context</span>
                  <ChevronDown className={cn("h-4 w-4 text-[var(--text-tertiary)] transition-transform duration-200", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-5 pt-1 space-y-6">
                    <div>
                      <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Staff Directory</p>
                      <div className="space-y-1">
                        {staff.map((s) => (
                          <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-semibold text-[var(--text-primary)]">{s.name}</p>
                              <p className="text-[13px] text-[var(--text-tertiary)]">{s.title}</p>
                            </div>
                            <button onClick={() => openEditStaff(role.id, s)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-[var(--surface-overlay)] transition-colors">
                              <Pencil className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => openAddStaff(role.id)} className="mt-2 w-full border border-dashed border-[var(--border-default)] rounded-xl py-3 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] transition-colors">+ Add person</button>
                    </div>
                    <div>
                      <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Communication Tone</p>
                      <textarea value={editTone[role.id] || ""} onChange={(e) => setEditTone((prev) => ({ ...prev, [role.id]: e.target.value }))} className={textareaCls} />
                    </div>
                    <div>
                      <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Role Context</p>
                      <textarea value={editContext[role.id] || ""} onChange={(e) => setEditContext((prev) => ({ ...prev, [role.id]: e.target.value }))} className={textareaCls} />
                    </div>
                    <button onClick={() => saveRole(role.id)} disabled={saving} className="bg-[var(--accent-blue)] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5">
                      <Save className="h-3.5 w-3.5" /> Save
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8">
          <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Schedule</p>
          <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)]">
            <ScheduleGrid roles={roles} />
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
          <button onClick={resetToday} className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">Reset today&apos;s tasks</button>
        </div>
      </div>

      {/* Edit Staff Dialog */}
      <Dialog open={!!editingStaff} onOpenChange={(open) => { if (!open) { setEditingStaff(null); setEditingRoleId(null); } }}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-[var(--surface-raised)] border-[var(--border-subtle)]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[var(--text-primary)]">Edit Staff</DialogTitle>
            <DialogDescription className="text-sm text-[var(--text-tertiary)]">Update contact information</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Name</label><input value={staffForm.name || ""} onChange={(e) => setStaffForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} /></div>
            <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Title</label><input value={staffForm.title || ""} onChange={(e) => setStaffForm((p) => ({ ...p, title: e.target.value }))} className={inputCls} /></div>
            <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Relationship</label><input value={staffForm.relationship || ""} onChange={(e) => setStaffForm((p) => ({ ...p, relationship: e.target.value }))} placeholder="e.g., Direct report, Manager" className={inputCls} /></div>
            <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Communication Notes</label><textarea value={staffForm.commNotes || ""} onChange={(e) => setStaffForm((p) => ({ ...p, commNotes: e.target.value }))} placeholder="Preferred style, availability..." className={`${textareaCls} min-h-[60px]`} /></div>
            <div className="flex gap-3">
              <div className="flex-1"><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Email</label><input value={staffForm.email || ""} onChange={(e) => setStaffForm((p) => ({ ...p, email: e.target.value }))} className={inputCls} /></div>
              <div className="flex-1"><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Slack Handle</label><input value={staffForm.slackHandle || ""} onChange={(e) => setStaffForm((p) => ({ ...p, slackHandle: e.target.value }))} placeholder="@handle" className={inputCls} /></div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={saveStaffEdit} className="flex-1 bg-[var(--accent-blue)] text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">Save</button>
            <button onClick={() => { setEditingStaff(null); setEditingRoleId(null); }} className="flex-1 border border-[var(--border-default)] text-[var(--text-secondary)] py-2.5 rounded-xl text-sm font-medium hover:bg-[var(--sidebar-hover)] transition-colors">Cancel</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Staff Dialog */}
      <Dialog open={!!addingRoleId} onOpenChange={(open) => { if (!open) setAddingRoleId(null); }}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-[var(--surface-raised)] border-[var(--border-subtle)]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[var(--text-primary)]">Add Person</DialogTitle>
            <DialogDescription className="text-sm text-[var(--text-tertiary)]">Add a new contact to the staff directory</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Name *</label><input value={newStaffForm.name || ""} onChange={(e) => setNewStaffForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} /></div>
            <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Title *</label><input value={newStaffForm.title || ""} onChange={(e) => setNewStaffForm((p) => ({ ...p, title: e.target.value }))} className={inputCls} /></div>
            <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Relationship</label><input value={newStaffForm.relationship || ""} onChange={(e) => setNewStaffForm((p) => ({ ...p, relationship: e.target.value }))} placeholder="e.g., Direct report, Manager" className={inputCls} /></div>
            <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Communication Notes</label><textarea value={newStaffForm.commNotes || ""} onChange={(e) => setNewStaffForm((p) => ({ ...p, commNotes: e.target.value }))} placeholder="Preferred style, availability..." className={`${textareaCls} min-h-[60px]`} /></div>
            <div className="flex gap-3">
              <div className="flex-1"><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Email</label><input value={newStaffForm.email || ""} onChange={(e) => setNewStaffForm((p) => ({ ...p, email: e.target.value }))} className={inputCls} /></div>
              <div className="flex-1"><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Slack Handle</label><input value={newStaffForm.slackHandle || ""} onChange={(e) => setNewStaffForm((p) => ({ ...p, slackHandle: e.target.value }))} placeholder="@handle" className={inputCls} /></div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={saveNewStaff} disabled={!newStaffForm.name || !newStaffForm.title} className="flex-1 bg-[var(--accent-blue)] text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">Add</button>
            <button onClick={() => setAddingRoleId(null)} className="flex-1 border border-[var(--border-default)] text-[var(--text-secondary)] py-2.5 rounded-xl text-sm font-medium hover:bg-[var(--sidebar-hover)] transition-colors">Cancel</button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
