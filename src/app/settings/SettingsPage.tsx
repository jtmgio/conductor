"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { ScheduleGrid } from "@/components/ScheduleGrid";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Settings, ChevronDown, Pencil, Save, LogOut, User, Briefcase, Wrench, Calendar, Zap, Trash2, Plus, Mic, Send, AlertCircle, Target, Users, RefreshCw, XCircle, Link2, DollarSign } from "lucide-react";
import { CostsContent } from "@/app/costs/CostsPage";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface Staff { id: string; name: string; title: string; relationship?: string; commNotes?: string; email?: string; slackHandle?: string; }
interface Role { id: string; name: string; title: string; platform: string; priority: number; color: string; tone?: string; context?: string; responsibilities?: string; quarterlyGoals?: string; }
interface UserProfile { communicationStyle?: string; sampleMessages?: string; globalContext?: string; calendarIgnorePatterns?: string; }
interface Skill { id: string; name: string; label: string; description: string; icon?: string; prompt: string; category: string; isBuiltIn: boolean; enabled: boolean; }
interface Integration { id: string; type: string; roleId: string; config: Record<string, string>; enabled: boolean; lastSyncAt: string | null; lastSyncResult: string | null; }

const inputCls = "w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all placeholder:text-[var(--text-tertiary)]";
const textareaCls = "w-full min-h-[140px] resize-y bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-4 text-[15px] leading-relaxed text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all placeholder:text-[var(--text-tertiary)]";

const TABS = [
  { id: "roles", label: "Roles", icon: Briefcase },
  { id: "profile", label: "Profile", icon: User },
  { id: "integrations", label: "Integrations", icon: Link2 },
  { id: "system", label: "System", icon: Wrench },
] as const;

type TabId = typeof TABS[number]["id"];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("roles");
  const [roles, setRoles] = useState<Role[]>([]);
  const [staffByRole, setStaffByRole] = useState<Record<string, Staff[]>>({});
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [editTone, setEditTone] = useState<Record<string, string>>({});
  const [editContext, setEditContext] = useState<Record<string, string>>({});
  const [editResponsibilities, setEditResponsibilities] = useState<Record<string, string>>({});
  const [editGoals, setEditGoals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState<Partial<Staff>>({});
  const [addingRoleId, setAddingRoleId] = useState<string | null>(null);
  const [newStaffForm, setNewStaffForm] = useState<Partial<Staff>>({});
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [addingSkill, setAddingSkill] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: "", label: "", description: "", prompt: "", category: "general" });
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [addingCompany, setAddingCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: "", title: "", platform: "Slack", color: "#4d8ef7" });
  const COLOR_PRESETS = ["#4d8ef7", "#2dd4bf", "#a78bfa", "#fbbf24", "#8cbf6e", "#fb7185", "#f97316", "#06b6d4", "#ec4899", "#84cc16", "#6366f1", "#14b8a6"];
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [linearForm, setLinearForm] = useState({ apiKey: "", teamId: "", userId: "", roleId: "" });
  const [addingLinear, setAddingLinear] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [systemSubTab, setSystemSubTab] = useState<"general" | "skills" | "costs">("general");
  const [editSkillForm, setEditSkillForm] = useState({ label: "", description: "", prompt: "", category: "general" });
  const { toast } = useToast();

  const SKILL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    Mic, Calendar, Send, AlertCircle, Target, Users, RefreshCw, XCircle, Zap,
  };
  const SkillIcon = ({ name, className }: { name?: string; className?: string }) => {
    const Icon = name ? SKILL_ICONS[name] : null;
    return Icon ? <Icon className={className} /> : <Zap className={className} />;
  };

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      const data = await res.json();
      if (Array.isArray(data)) setAllSkills(data);
    } catch {}
  }, []);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      if (Array.isArray(data)) setIntegrations(data);
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [rolesRes, profileRes] = await Promise.all([fetch("/api/roles"), fetch("/api/profile")]);
      const rolesData = await rolesRes.json(); const arr: Role[] = Array.isArray(rolesData) ? rolesData : [];
      setRoles(arr);
      const tones: Record<string, string> = {}; const contexts: Record<string, string> = {};
      const resps: Record<string, string> = {}; const goals: Record<string, string> = {};
      for (const r of arr) { tones[r.id] = r.tone || ""; contexts[r.id] = r.context || ""; resps[r.id] = r.responsibilities || ""; goals[r.id] = r.quarterlyGoals || ""; }
      setEditTone(tones); setEditContext(contexts); setEditResponsibilities(resps); setEditGoals(goals);
      if (profileRes.ok) { const p = await profileRes.json(); setProfile({ communicationStyle: p.communicationStyle || "", sampleMessages: p.sampleMessages || "", globalContext: p.globalContext || "", calendarIgnorePatterns: p.calendarIgnorePatterns || "" }); }
      const staffResults: Record<string, Staff[]> = {};
      await Promise.all(arr.map(async (role) => { staffResults[role.id] = await fetch(`/api/roles/${role.id}/staff`).then(r => r.json()); }));
      setStaffByRole(staffResults);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); fetchSkills(); fetchIntegrations(); }, [fetchData, fetchSkills, fetchIntegrations]);

  const toggleRole = (roleId: string) => setExpandedRoleId((prev) => (prev === roleId ? null : roleId));
  const saveRole = async (roleId: string) => { setSaving(true); try { const res = await fetch(`/api/roles/${roleId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tone: editTone[roleId], context: editContext[roleId], responsibilities: editResponsibilities[roleId], quarterlyGoals: editGoals[roleId] }) }); if (!res.ok) throw new Error(); toast("Role settings saved", "success"); } catch { toast("Failed to save", "error"); } setSaving(false); };
  const saveProfile = async () => { setSavingProfile(true); try { const res = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) }); if (!res.ok) throw new Error(); toast("Voice profile saved", "success"); } catch { toast("Failed to save", "error"); } setSavingProfile(false); };
  const openEditStaff = (roleId: string, staff: Staff) => { setEditingStaff(staff); setEditingRoleId(roleId); setStaffForm({ ...staff }); };
  const saveStaffEdit = async () => { if (!editingStaff || !editingRoleId) return; try { const res = await fetch(`/api/roles/${editingRoleId}/staff/${editingStaff.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(staffForm) }); if (!res.ok) throw new Error(); toast("Staff updated", "success"); } catch { toast("Failed to save", "error"); } setEditingStaff(null); setEditingRoleId(null); setStaffForm({}); fetchData(); };
  const openAddStaff = (roleId: string) => { setAddingRoleId(roleId); setNewStaffForm({}); };
  const saveNewStaff = async () => { if (!addingRoleId || !newStaffForm.name || !newStaffForm.title) return; try { const res = await fetch(`/api/roles/${addingRoleId}/staff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStaffForm) }); if (!res.ok) throw new Error(); toast("Staff added", "success"); } catch { toast("Failed to add staff", "error"); } setAddingRoleId(null); setNewStaffForm({}); fetchData(); };
  const saveCalendarPatterns = async () => {
    setSavingCalendar(true);
    try {
      const res = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarIgnorePatterns: profile.calendarIgnorePatterns }) });
      if (!res.ok) throw new Error();
      toast("Calendar settings saved", "success");
    } catch { toast("Failed to save", "error"); }
    setSavingCalendar(false);
  };
  const resetToday = async () => { try { await fetch("/api/tasks/reset-today", { method: "POST" }); toast("Today's tasks reset", "success"); } catch { toast("Failed to reset", "error"); } };
  const createCompany = async () => {
    if (!newCompany.name || !newCompany.title) return;
    try {
      const res = await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newCompany) });
      if (!res.ok) throw new Error();
      toast("Company added", "success");
      setAddingCompany(false);
      setNewCompany({ name: "", title: "", platform: "Slack", color: "#4d8ef7" });
      fetchData();
    } catch { toast("Failed to add", "error"); }
  };
  const toggleRoleActive = async (roleId: string, active: boolean) => {
    try {
      await fetch(`/api/roles/${roleId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
      fetchData();
    } catch { toast("Failed to update", "error"); }
  };
  const deleteRole = async (roleId: string) => {
    try {
      await fetch(`/api/roles/${roleId}`, { method: "DELETE" });
      toast("Company deactivated", "success");
      fetchData();
    } catch { toast("Failed to deactivate", "error"); }
  };
  const exportConfig = async () => {
    try {
      const res = await fetch("/api/export");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `conductor-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      toast("Config exported", "success");
    } catch { toast("Failed to export", "error"); }
  };
  const createLinearIntegration = async () => {
    if (!linearForm.apiKey || !linearForm.teamId || !linearForm.userId) return;
    try {
      const res = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "linear", roleId: linearForm.roleId, config: { apiKey: linearForm.apiKey, teamId: linearForm.teamId, userId: linearForm.userId, roleId: linearForm.roleId } }) });
      if (!res.ok) throw new Error();
      toast("Linear integration added", "success");
      setAddingLinear(false);
      setLinearForm({ apiKey: "", teamId: "", userId: "", roleId: "" });
      fetchIntegrations();
    } catch { toast("Failed to create", "error"); }
  };
  const toggleIntegration = async (type: string, enabled: boolean) => {
    try {
      await fetch(`/api/integrations/${type}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      fetchIntegrations();
    } catch { toast("Failed to update", "error"); }
  };
  const deleteIntegration = async (type: string) => {
    try {
      await fetch(`/api/integrations/${type}`, { method: "DELETE" });
      toast("Integration removed", "success");
      fetchIntegrations();
    } catch { toast("Failed to delete", "error"); }
  };
  const syncNow = async (type: string) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/integrations/${type}/sync`, { method: "POST" });
      const data = await res.json();
      if (data.success) { toast(`Synced: ${data.summary}`, "success"); } else { toast(data.error || "Sync failed", "error"); }
      fetchIntegrations();
    } catch { toast("Sync failed", "error"); }
    setSyncing(false);
  };
  const toggleSkill = async (skill: Skill) => {
    try {
      await fetch(`/api/skills/${skill.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !skill.enabled }) });
      fetchSkills();
    } catch { toast("Failed to update", "error"); }
  };
  const deleteSkill = async (id: string) => {
    try {
      await fetch(`/api/skills/${id}`, { method: "DELETE" });
      toast("Skill deleted", "success");
      fetchSkills();
    } catch { toast("Failed to delete", "error"); }
  };
  const createSkill = async () => {
    if (!newSkill.name || !newSkill.label || !newSkill.prompt) return;
    try {
      const res = await fetch("/api/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newSkill) });
      if (!res.ok) throw new Error();
      toast("Skill created", "success");
      setAddingSkill(false);
      setNewSkill({ name: "", label: "", description: "", prompt: "", category: "general" });
      fetchSkills();
    } catch { toast("Failed to create", "error"); }
  };
  const saveSkillEdit = async () => {
    if (!editingSkillId) return;
    try {
      const res = await fetch(`/api/skills/${editingSkillId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editSkillForm) });
      if (!res.ok) throw new Error();
      toast("Skill updated", "success");
      setEditingSkillId(null);
      fetchSkills();
    } catch { toast("Failed to save", "error"); }
  };

  return (
    <AppShell>
      <div className="py-6">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-6">
          <Settings className="h-6 w-6 text-[var(--text-tertiary)]" />
          <h1 className="text-[32px] font-semibold text-[var(--text-primary)]">Settings</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-[var(--border-subtle)]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-[15px] font-medium transition-colors relative",
                activeTab === tab.id
                  ? "text-[var(--accent-blue)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-blue)] rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* TAB: Profile */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            <p className="text-[15px] text-[var(--text-tertiary)]">How AI writes as you — applies to all roles</p>
            <div>
              <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Communication Style</p>
              <textarea value={profile.communicationStyle || ""} onChange={(e) => setProfile((p) => ({ ...p, communicationStyle: e.target.value }))} placeholder="How do you write? Direct? Casual? Describe your patterns..." className={`${textareaCls} min-h-[200px]`} />
            </div>
            <div>
              <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Sample Messages</p>
              <textarea value={profile.sampleMessages || ""} onChange={(e) => setProfile((p) => ({ ...p, sampleMessages: e.target.value }))} placeholder="Paste 3-5 real Slack/email messages you've sent. Separate with ---" className={`${textareaCls} min-h-[280px]`} />
            </div>
            <div>
              <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">About Me</p>
              <textarea value={profile.globalContext || ""} onChange={(e) => setProfile((p) => ({ ...p, globalContext: e.target.value }))} placeholder="Anything the AI should always know about you..." className={`${textareaCls} min-h-[160px]`} />
            </div>
            <button onClick={saveProfile} disabled={savingProfile} className="bg-[var(--accent-blue)] text-white px-5 py-3 rounded-xl text-[15px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
              <Save className="h-4 w-4" /> {savingProfile ? "Saving..." : "Save voice profile"}
            </button>
          </div>
        )}

        {/* TAB: Roles */}
        {activeTab === "roles" && (
          <div className="space-y-2">
            {roles.map((role) => {
              const isOpen = expandedRoleId === role.id;
              const staff = staffByRole[role.id] || [];
              return (
                <div key={role.id} className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--surface-raised)]">
                  <button onClick={() => toggleRole(role.id)} className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[44px] text-left hover:bg-[var(--sidebar-hover)] transition-colors">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[15px] font-semibold shrink-0" style={{ backgroundColor: `${role.color}1a`, color: role.color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: role.color }} />{role.name}
                    </span>
                    <span className="text-[16px] text-[var(--text-secondary)] flex-1">{role.title}</span>
                    <ChevronDown className={cn("h-4 w-4 text-[var(--text-tertiary)] transition-transform duration-200", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-5 pt-1 space-y-6">
                      <div>
                        <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">My Role</p>
                        <textarea value={editResponsibilities[role.id] || ""} onChange={(e) => setEditResponsibilities((prev) => ({ ...prev, [role.id]: e.target.value }))} placeholder="What you own and are accountable for in this role..." className={`${textareaCls} min-h-[180px]`} />
                      </div>
                      <div>
                        <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Quarterly Goals</p>
                        <textarea value={editGoals[role.id] || ""} onChange={(e) => setEditGoals((prev) => ({ ...prev, [role.id]: e.target.value }))} placeholder="Current quarter objectives..." className={`${textareaCls} min-h-[160px]`} />
                      </div>
                      <div>
                        <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Communication Tone</p>
                        <textarea value={editTone[role.id] || ""} onChange={(e) => setEditTone((prev) => ({ ...prev, [role.id]: e.target.value }))} className={textareaCls} />
                      </div>
                      <div>
                        <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">Role Context</p>
                        <textarea value={editContext[role.id] || ""} onChange={(e) => setEditContext((prev) => ({ ...prev, [role.id]: e.target.value }))} className={textareaCls} />
                      </div>
                      <div>
                        <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Staff Directory</p>
                        <div className="space-y-1">
                          {staff.map((s) => (
                            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors">
                              <div className="flex-1 min-w-0">
                                <p className="text-[16px] font-semibold text-[var(--text-primary)]">{s.name}</p>
                                <p className="text-[14px] text-[var(--text-tertiary)]">{s.title}</p>
                              </div>
                              <button onClick={() => openEditStaff(role.id, s)} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-[var(--surface-overlay)] transition-colors">
                                <Pencil className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => openAddStaff(role.id)} className="mt-2 w-full border border-dashed border-[var(--border-default)] rounded-xl py-3 text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] transition-colors">+ Add person</button>
                      </div>
                      <button onClick={() => saveRole(role.id)} disabled={saving} className="bg-[var(--accent-blue)] text-white px-5 py-3 rounded-xl text-[15px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
                        <Save className="h-4 w-4" /> Save
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add Company */}
            {addingCompany ? (
              <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3 mt-3">
                <div className="flex gap-3">
                  <input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} placeholder="Company name" className={`${inputCls} flex-1`} />
                  <select value={newCompany.platform} onChange={(e) => setNewCompany({ ...newCompany, platform: e.target.value })} className={`${inputCls} w-28`}>
                    <option>Slack</option><option>Teams</option><option>Other</option>
                  </select>
                </div>
                <input value={newCompany.title} onChange={(e) => setNewCompany({ ...newCompany, title: e.target.value })} placeholder="Your title (e.g., Senior Engineer)" className={inputCls} />
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[var(--text-tertiary)]">Color:</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLOR_PRESETS.map((c) => (
                      <button key={c} onClick={() => setNewCompany({ ...newCompany, color: c })} className="w-6 h-6 rounded-full border-2 transition-all" style={{ backgroundColor: c, borderColor: newCompany.color === c ? "white" : "transparent" }} />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={createCompany} disabled={!newCompany.name || !newCompany.title} className="bg-[var(--accent-blue)] text-white px-4 py-2.5 rounded-xl text-[14px] font-medium hover:opacity-90 disabled:opacity-40">Add</button>
                  <button onClick={() => setAddingCompany(false)} className="border border-[var(--border-default)] text-[var(--text-secondary)] px-4 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[var(--sidebar-hover)]">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingCompany(true)} className="mt-3 w-full border border-dashed border-[var(--border-default)] rounded-xl py-3 text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] transition-colors flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" /> Add company
              </button>
            )}
          </div>
        )}

        {/* TAB: Integrations */}
        {activeTab === "integrations" && (
          <div className="space-y-8">
            {/* Calendar */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-[var(--text-tertiary)]" />
                <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Calendar</p>
              </div>
              <p className="text-[14px] text-[var(--text-tertiary)] mb-3">Meetings matching these patterns are ignored</p>
              <textarea
                value={profile.calendarIgnorePatterns || "OOO\nOut of Office\nBusy\nDeep Work\nFocus Time\nBlock\nHold\nNo meetings\nLunch\nPersonal\nIronman\nTraining\nSwim\nBike\nRun"}
                onChange={(e) => setProfile((p) => ({ ...p, calendarIgnorePatterns: e.target.value }))}
                placeholder="One pattern per line..."
                className={`${textareaCls} min-h-[200px]`}
              />
              <button onClick={saveCalendarPatterns} disabled={savingCalendar} className="mt-3 bg-[var(--accent-blue)] text-white px-5 py-3 rounded-xl text-[15px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
                <Save className="h-4 w-4" /> {savingCalendar ? "Saving..." : "Save calendar settings"}
              </button>
            </div>

            {/* Linear */}
            <div className="border-t border-[var(--border-subtle)] pt-6">
              <div className="flex items-center gap-2 mb-1">
                <svg width="16" height="16" viewBox="0 0 16 16" className="text-[var(--text-tertiary)]"><path d="M2.5 2.5h11v11h-11z" stroke="currentColor" strokeWidth="1" fill="none" rx="2"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Linear</p>
              </div>

              {integrations.filter((i) => i.type === "linear").map((integration) => {
                const roleName = roles.find((r) => r.id === integration.roleId)?.name || integration.roleId;
                const lastSync = integration.lastSyncAt ? new Date(integration.lastSyncAt) : null;
                const ago = lastSync ? Math.floor((Date.now() - lastSync.getTime()) / 60000) : null;
                const agoLabel = ago !== null ? (ago < 1 ? "just now" : ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`) : "never";

                return (
                  <div key={integration.id} className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3 mt-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[16px] font-semibold text-[var(--text-primary)]">Linear ({roleName})</p>
                        <p className="text-[13px] text-[var(--text-tertiary)]">API Key: {integration.config.apiKey || "not set"}</p>
                      </div>
                      <button
                        onClick={() => toggleIntegration("linear", !integration.enabled)}
                        className={cn(
                          "w-11 h-6 rounded-full relative transition-colors shrink-0",
                          integration.enabled ? "bg-[var(--accent-blue)]" : "bg-[var(--border-default)]"
                        )}
                      >
                        <span className={cn(
                          "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                          integration.enabled ? "left-[22px]" : "left-0.5"
                        )} />
                      </button>
                    </div>
                    <div className="text-[14px] text-[var(--text-secondary)] space-y-1">
                      <p>Team ID: <span className="text-[var(--text-tertiary)] font-mono text-[13px]">{integration.config.teamId}</span></p>
                      <p>Syncs to role: <span className="font-medium">{roleName}</span></p>
                      <p>Last sync: <span className="text-[var(--text-tertiary)]">{agoLabel}</span>
                        {integration.lastSyncResult && <span className="text-[var(--text-tertiary)]"> — {integration.lastSyncResult}</span>}
                      </p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => syncNow("linear")} disabled={syncing} className="bg-[var(--accent-blue)] text-white px-4 py-2 rounded-xl text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                        {syncing ? "Syncing..." : "Sync now"}
                      </button>
                      <button onClick={() => deleteIntegration("linear")} className="border border-[var(--border-default)] text-red-400 px-4 py-2 rounded-xl text-[14px] font-medium hover:bg-[var(--sidebar-hover)] transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              {integrations.filter((i) => i.type === "linear").length === 0 && (
                <>
                  {addingLinear ? (
                    <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3 mt-3">
                      <div>
                        <label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">API Key</label>
                        <input value={linearForm.apiKey} onChange={(e) => setLinearForm((p) => ({ ...p, apiKey: e.target.value }))} placeholder="lin_api_..." className={inputCls} />
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Team ID</label>
                          <input value={linearForm.teamId} onChange={(e) => setLinearForm((p) => ({ ...p, teamId: e.target.value }))} placeholder="From Linear API" className={inputCls} />
                        </div>
                        <div className="flex-1">
                          <label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">User ID</label>
                          <input value={linearForm.userId} onChange={(e) => setLinearForm((p) => ({ ...p, userId: e.target.value }))} placeholder="From Linear API" className={inputCls} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Sync to role</label>
                        <select value={linearForm.roleId} onChange={(e) => setLinearForm((p) => ({ ...p, roleId: e.target.value }))} className={inputCls}>
                          {roles.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.title}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={createLinearIntegration} disabled={!linearForm.apiKey || !linearForm.teamId || !linearForm.userId} className="bg-[var(--accent-blue)] text-white px-4 py-2.5 rounded-xl text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40">Connect</button>
                        <button onClick={() => setAddingLinear(false)} className="border border-[var(--border-default)] text-[var(--text-secondary)] px-4 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[var(--sidebar-hover)] transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <p className="text-[14px] text-[var(--text-tertiary)] mb-3">Sync tasks from Linear into Conductor automatically.</p>
                      <button onClick={() => setAddingLinear(true)} className="border border-dashed border-[var(--border-default)] rounded-xl py-3 px-6 text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] transition-colors flex items-center gap-2">
                        <Plus className="h-4 w-4" /> Connect Linear
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Granola */}
            <div className="border-t border-[var(--border-subtle)] pt-6">
              <div className="flex items-center gap-2 mb-1">
                <Mic className="h-4 w-4 text-[var(--text-tertiary)]" />
                <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Granola</p>
              </div>

              {integrations.filter((i) => i.type === "granola").map((integration) => {
                const lastSync = integration.lastSyncAt ? new Date(integration.lastSyncAt) : null;
                const ago = lastSync ? Math.floor((Date.now() - lastSync.getTime()) / 60000) : null;
                const agoLabel = ago !== null ? (ago < 1 ? "just now" : ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`) : "never";

                return (
                  <div key={integration.id} className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3 mt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[16px] font-semibold text-[var(--text-primary)]">Granola (All roles)</p>
                      <button
                        onClick={() => toggleIntegration("granola", !integration.enabled)}
                        className={cn(
                          "w-11 h-6 rounded-full relative transition-colors shrink-0",
                          integration.enabled ? "bg-[var(--accent-blue)]" : "bg-[var(--border-default)]"
                        )}
                      >
                        <span className={cn(
                          "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                          integration.enabled ? "left-[22px]" : "left-0.5"
                        )} />
                      </button>
                    </div>
                    <div className="text-[14px] text-[var(--text-secondary)] space-y-1">
                      <p className="text-[13px] text-[var(--text-tertiary)]">Maps Granola folders to roles automatically</p>
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        {["Zeta", "HealthMap", "vQuip", "HealthMe", "Xenegrade", "React Health"].map((folder) => (
                          <span key={folder} className="text-[12px] text-[var(--text-tertiary)]">{folder} folder &rarr; {folder}</span>
                        ))}
                      </div>
                      <p className="mt-2">Syncs every 30 minutes via system cron</p>
                      <p>Last sync: <span className="text-[var(--text-tertiary)]">{agoLabel}</span>
                        {integration.lastSyncResult && <span className="text-[var(--text-tertiary)]"> — {integration.lastSyncResult}</span>}
                      </p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => syncNow("granola")} disabled={syncing} className="bg-[var(--accent-blue)] text-white px-4 py-2 rounded-xl text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                        {syncing ? "Syncing..." : "Sync now"}
                      </button>
                      <button onClick={() => deleteIntegration("granola")} className="border border-[var(--border-default)] text-red-400 px-4 py-2 rounded-xl text-[14px] font-medium hover:bg-[var(--sidebar-hover)] transition-colors">
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}

              {integrations.filter((i) => i.type === "granola").length === 0 && (
                <div className="mt-3">
                  <p className="text-[14px] text-[var(--text-tertiary)] mb-3">Auto-sync meeting transcripts from Granola into tasks and follow-ups across all roles. Requires GRANOLA_API_KEY in .env.local.</p>
                  <button
                    onClick={async () => {
                      try {
                        await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "granola", roleId: "zeta", config: {} }) });
                        toast("Granola integration connected", "success");
                        fetchIntegrations();
                      } catch { toast("Failed to connect", "error"); }
                    }}
                    className="border border-dashed border-[var(--border-default)] rounded-xl py-3 px-6 text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] transition-colors flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" /> Connect Granola
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: System */}
        {activeTab === "system" && (
          <div className="flex gap-6 min-h-[500px]">
            {/* Vertical sub-tabs */}
            <div className="w-[160px] shrink-0 space-y-1">
              {([
                { id: "general" as const, label: "General", icon: Settings },
                { id: "skills" as const, label: "Skills", icon: Zap },
                { id: "costs" as const, label: "Costs", icon: DollarSign },
              ]).map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setSystemSubTab(sub.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors text-left",
                    systemSubTab === sub.id
                      ? "bg-[var(--sidebar-active)] text-[var(--text-primary)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
                  )}
                >
                  <sub.icon className="h-4 w-4 shrink-0" />
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Sub-tab content */}
            <div className="flex-1 min-w-0">

              {/* General */}
              {systemSubTab === "general" && (
                <div className="space-y-8">
                  {/* About */}
                  <div className="border border-[var(--border-subtle)] rounded-xl p-5 bg-[var(--surface-raised)]">
                    <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">About Conductor</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[14px]">
                      <div>
                        <p className="text-[var(--text-tertiary)] mb-1">Core</p>
                        <p className="text-[var(--text-secondary)]">Focus view, Inbox processor, Follow-up tracker, Kanban board, AI chat</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-tertiary)] mb-1">AI Features</p>
                        <p className="text-[var(--text-secondary)]">8 slash commands, artifact rendering, 3 model options, voice-matched drafting</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-tertiary)] mb-1">Integrations</p>
                        <p className="text-[var(--text-secondary)]">Linear (hourly task sync), Granola (30min meeting transcript sync)</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-tertiary)] mb-1">Stack</p>
                        <p className="text-[var(--text-secondary)]">Next.js 14 + Prisma + PostgreSQL + shadcn/ui + Tailwind + Framer Motion</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] flex gap-4 text-[12px] text-[var(--text-tertiary)]">
                      <span>15 models</span>
                      <span>30+ API routes</span>
                      <span>6 roles</span>
                      <span>3 themes</span>
                    </div>
                  </div>

                  {/* Schedule */}
                  <div>
                    <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Schedule</p>
                    <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)]">
                      <ScheduleGrid roles={roles} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t border-[var(--border-subtle)] pt-6 space-y-4">
                    <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Actions</p>
                    <div className="flex flex-col gap-3">
                      <button onClick={exportConfig} className="text-left text-[15px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2">
                        Export configuration (JSON)
                      </button>
                      <button onClick={resetToday} className="text-left text-[15px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2">
                        Reset today&apos;s tasks
                      </button>
                      <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="text-left flex items-center gap-2 text-[15px] text-[var(--text-tertiary)] hover:text-red-400 transition-colors py-2"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Skills */}
              {systemSubTab === "skills" && (
                <div className="space-y-4">
                  <p className="text-[14px] text-[var(--text-tertiary)] mb-3">Slash commands for the AI chat — type / in the chat input</p>
                  <div className="space-y-1 mb-4">
                    {allSkills.filter((s) => s.isBuiltIn).map((skill) => (
                      <div key={skill.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                        <SkillIcon name={skill.icon} className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-medium text-[var(--text-primary)]">/{skill.name}</p>
                          <p className="text-[13px] text-[var(--text-tertiary)]">{skill.description}</p>
                        </div>
                        <button
                          onClick={() => toggleSkill(skill)}
                          className={cn(
                            "w-11 h-6 rounded-full relative transition-colors shrink-0",
                            skill.enabled ? "bg-[var(--accent-blue)]" : "bg-[var(--border-default)]"
                          )}
                        >
                          <span className={cn(
                            "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                            skill.enabled ? "left-[22px]" : "left-0.5"
                          )} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* Custom skills */}
                  <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mt-6">Custom</p>
                  <div className="space-y-1">
                    {allSkills.filter((s) => !s.isBuiltIn).map((skill) => (
                      <div key={skill.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                        <Zap className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-medium text-[var(--text-primary)]">/{skill.name}</p>
                          <p className="text-[13px] text-[var(--text-tertiary)]">{skill.description}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => { setEditingSkillId(skill.id); setEditSkillForm({ label: skill.label, description: skill.description, prompt: skill.prompt, category: skill.category }); }} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--sidebar-hover)] transition-colors">
                            <Pencil className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                          </button>
                          <button onClick={() => deleteSkill(skill.id)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[var(--sidebar-hover)] transition-colors">
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {allSkills.filter((s) => !s.isBuiltIn).length === 0 && !addingSkill && (
                      <p className="text-[14px] text-[var(--text-tertiary)] py-2">No custom skills yet</p>
                    )}
                  </div>
                  {addingSkill ? (
                    <div className="mt-3 border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-1"><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Name</label><input value={newSkill.name} onChange={(e) => setNewSkill((p) => ({ ...p, name: e.target.value }))} placeholder="my-skill" className={inputCls} /></div>
                        <div className="flex-1"><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Label</label><input value={newSkill.label} onChange={(e) => setNewSkill((p) => ({ ...p, label: e.target.value }))} placeholder="My Skill" className={inputCls} /></div>
                      </div>
                      <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Description</label><input value={newSkill.description} onChange={(e) => setNewSkill((p) => ({ ...p, description: e.target.value }))} placeholder="What this skill does" className={inputCls} /></div>
                      <div>
                        <label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Prompt template</label>
                        <textarea value={newSkill.prompt} onChange={(e) => setNewSkill((p) => ({ ...p, prompt: e.target.value }))} placeholder="Use {{roleName}}, {{todayTasks}}, etc." className={`${textareaCls} min-h-[160px]`} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={createSkill} disabled={!newSkill.name || !newSkill.label || !newSkill.prompt} className="bg-[var(--accent-blue)] text-white px-4 py-2.5 rounded-xl text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40">Create</button>
                        <button onClick={() => setAddingSkill(false)} className="border border-[var(--border-default)] text-[var(--text-secondary)] px-4 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[var(--sidebar-hover)] transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingSkill(true)} className="mt-3 w-full border border-dashed border-[var(--border-default)] rounded-xl py-3 text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] transition-colors flex items-center justify-center gap-2">
                      <Plus className="h-4 w-4" /> Add skill
                    </button>
                  )}
                  {editingSkillId && (
                    <div className="mt-3 border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3">
                      <p className="text-[15px] font-medium text-[var(--text-primary)]">Edit skill</p>
                      <div className="flex gap-3">
                        <div className="flex-1"><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Label</label><input value={editSkillForm.label} onChange={(e) => setEditSkillForm((p) => ({ ...p, label: e.target.value }))} className={inputCls} /></div>
                        <div className="flex-1"><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Description</label><input value={editSkillForm.description} onChange={(e) => setEditSkillForm((p) => ({ ...p, description: e.target.value }))} className={inputCls} /></div>
                      </div>
                      <div><label className="text-[13px] text-[var(--text-tertiary)] mb-1 block">Prompt template</label><textarea value={editSkillForm.prompt} onChange={(e) => setEditSkillForm((p) => ({ ...p, prompt: e.target.value }))} className={`${textareaCls} min-h-[160px]`} /></div>
                      <div className="flex gap-2">
                        <button onClick={saveSkillEdit} className="bg-[var(--accent-blue)] text-white px-4 py-2.5 rounded-xl text-[14px] font-medium hover:opacity-90 transition-opacity">Save</button>
                        <button onClick={() => setEditingSkillId(null)} className="border border-[var(--border-default)] text-[var(--text-secondary)] px-4 py-2.5 rounded-xl text-[14px] font-medium hover:bg-[var(--sidebar-hover)] transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Costs */}
              {systemSubTab === "costs" && (
                <CostsContent />
              )}

            </div>
          </div>
        )}
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
