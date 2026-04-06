"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Upload, ArrowRight, ArrowLeft, Check, Palette, MessageSquare, Clock } from "lucide-react";

const COLOR_PRESETS = [
  "#4d8ef7", "#2dd4bf", "#a78bfa", "#fbbf24", "#8cbf6e", "#fb7185",
  "#f97316", "#06b6d4", "#ec4899", "#84cc16", "#6366f1", "#14b8a6",
];

interface NewRole {
  name: string;
  title: string;
  platforms: string[];
  color: string;
}

const STEPS = ["welcome", "password", "companies", "schedule", "profile", "done"] as const;
type Step = typeof STEPS[number];

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [roles, setRoles] = useState<NewRole[]>([]);
  const [newRole, setNewRole] = useState<NewRole>({ name: "", title: "", platforms: [], color: COLOR_PRESETS[0] });
  const [commStyle, setCommStyle] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [savedRoles, setSavedRoles] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<Array<{
    label: string; startHour: number; startMinute: number; endHour: number; endMinute: number; roleId: string;
  }>>([
    { label: "Morning", startHour: 7, startMinute: 30, endHour: 10, endMinute: 0, roleId: "" },
    { label: "Midday", startHour: 10, startMinute: 0, endHour: 14, endMinute: 0, roleId: "" },
    { label: "Afternoon", startHour: 14, startMinute: 0, endHour: 17, endMinute: 0, roleId: "" },
  ]);
  const [importing, setImporting] = useState(false);

  const stepIdx = STEPS.indexOf(step);

  const next = () => {
    const nextIdx = stepIdx + 1;
    if (nextIdx < STEPS.length) setStep(STEPS[nextIdx]);
  };

  const prev = () => {
    const prevIdx = stepIdx - 1;
    if (prevIdx >= 0) setStep(STEPS[prevIdx]);
  };

  const handleSetPassword = async () => {
    if (password.length < 4) { setPasswordError("At least 4 characters"); return; }
    if (password !== confirmPassword) { setPasswordError("Passwords don't match"); return; }
    setPasswordError("");
    setSaving(true);
    try {
      const res = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPasswordError(data.error || "Failed to set password");
        setSaving(false);
        return;
      }
      // If roles already exist (from import), skip straight to done
      try {
        const setupCheck = await fetch("/api/setup").then((r) => r.json());
        if (!setupCheck.needsSetup) { setStep("done"); } else { next(); }
      } catch { next(); }
    } catch { setPasswordError("Failed to set password"); }
    setSaving(false);
  };

  const addRole = () => {
    if (!newRole.name.trim() || !newRole.title.trim()) return;
    setRoles([...roles, { ...newRole }]);
    setNewRole({ name: "", title: "", platforms: [], color: COLOR_PRESETS[(roles.length + 1) % COLOR_PRESETS.length] });
  };

  const removeRole = (idx: number) => {
    setRoles(roles.filter((_, i) => i !== idx));
  };

  const handleSaveCompanies = async () => {
    if (roles.length === 0) return;
    setSaving(true);
    try {
      const created: Array<{ id: string; name: string; color: string }> = [];
      for (let i = 0; i < roles.length; i++) {
        const { platforms, ...rest } = roles[i];
        const res = await fetch("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rest, platform: platforms.join(", ") || "Slack", priority: i + 1 }),
        });
        const role = await res.json();
        created.push({ id: role.id, name: role.name, color: role.color });
      }
      setSavedRoles(created);
      next();
    } catch {}
    setSaving(false);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communicationStyle: commStyle || null, globalContext: aboutMe || null }),
      });
    } catch {}
    setSaving(false);
    next();
  };



  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      const validBlocks = scheduleBlocks.filter((b) => b.roleId);
      for (let i = 0; i < validBlocks.length; i++) {
        const b = validBlocks[i];
        const dayAssignments: Record<string, string> = {};
        // Assign to all weekdays (1=Mon through 5=Fri)
        for (let d = 1; d <= 5; d++) dayAssignments[String(d)] = b.roleId;
        await fetch("/api/schedule/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: b.label,
            startHour: b.startHour,
            startMinute: b.startMinute,
            endHour: b.endHour,
            endMinute: b.endMinute,
            dayAssignments,
            sortOrder: i + 1,
          }),
        });
      }
    } catch {}
    setSaving(false);
    next();
  };

  const formatTime = (h: number, m: number) => {
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
  };

  const addBlock = () => {
    const last = scheduleBlocks[scheduleBlocks.length - 1];
    const startH = last ? last.endHour : 9;
    const startM = last ? last.endMinute : 0;
    setScheduleBlocks([...scheduleBlocks, { label: "", startHour: startH, startMinute: startM, endHour: Math.min(startH + 2, 23), endMinute: 0, roleId: "" }]);
  };

  const removeBlock = (idx: number) => {
    setScheduleBlocks(scheduleBlocks.filter((_, i) => i !== idx));
  };

  const updateBlock = (idx: number, updates: Partial<typeof scheduleBlocks[0]>) => {
    const updated = [...scheduleBlocks];
    updated[idx] = { ...updated[idx], ...updates };
    setScheduleBlocks(updated);
  };

  const handleFinish = () => {
    onComplete();
  };

  const inputCls = "w-full h-11 px-4 rounded-xl border border-[var(--border-subtle)] text-[15px] text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 placeholder:text-[var(--text-tertiary)]";

  return (
    <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-6">
      <div className="w-full max-w-[520px]">
        {/* Progress */}
        <div className="flex gap-1.5 mb-10">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className="flex-1 h-1 rounded-full transition-colors"
              style={{ backgroundColor: i <= stepIdx ? "var(--accent-blue)" : "var(--border-subtle)" }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Welcome */}
            {step === "welcome" && (
              <div className="text-center">
                <h1 className="text-[36px] font-bold text-[var(--text-primary)] mb-3">Welcome to Conductor</h1>
                <p className="text-[17px] text-[var(--text-tertiary)] mb-10 leading-relaxed">
                  A personal productivity OS for engineers managing multiple roles.
                </p>
                <button onClick={next} className="bg-[var(--accent-blue)] text-white px-8 py-3.5 rounded-xl text-[16px] font-semibold hover:opacity-90 transition-opacity">
                  Get Started <ArrowRight className="inline h-4 w-4 ml-1" />
                </button>
                <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
                  <p className="text-[14px] text-[var(--text-tertiary)] mb-3">Already have a Conductor export?</p>
                  <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border-subtle)] text-[14px] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                    <Upload className="h-4 w-4" />
                    Import config file
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setImporting(true);
                        try {
                          const text = await file.text();
                          const data = JSON.parse(text);
                          const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
                          if (!res.ok) throw new Error();
                          setStep("password");
                        } catch {}
                        setImporting(false);
                      }}
                    />
                  </label>
                  {importing && <p className="text-[13px] text-[var(--accent-blue)] mt-2">Importing...</p>}
                </div>
              </div>
            )}

            {/* Password */}
            {step === "password" && (
              <div>
                <h2 className="text-[28px] font-bold text-[var(--text-primary)] mb-2">Set your password</h2>
                <p className="text-[15px] text-[var(--text-tertiary)] mb-8">This protects your local Conductor instance.</p>
                <div className="space-y-4">
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputCls} />
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className={inputCls} onKeyDown={(e) => e.key === "Enter" && handleSetPassword()} />
                  {passwordError && <p className="text-red-400 text-[14px]">{passwordError}</p>}
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={prev} className="px-5 py-3 rounded-xl text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><ArrowLeft className="inline h-4 w-4 mr-1" /> Back</button>
                  <button onClick={handleSetPassword} disabled={saving} className="flex-1 bg-[var(--accent-blue)] text-white py-3 rounded-xl text-[15px] font-semibold hover:opacity-90 disabled:opacity-50">
                    {saving ? "Setting..." : "Continue"}
                  </button>
                </div>
              </div>
            )}

            {/* Companies */}
            {step === "companies" && (
              <div>
                <h2 className="text-[28px] font-bold text-[var(--text-primary)] mb-2">Add your companies</h2>
                <p className="text-[15px] text-[var(--text-tertiary)] mb-6">Each company becomes a role you switch between throughout the day.</p>

                {/* Added roles */}
                {roles.length > 0 && (
                  <div className="space-y-2 mb-6">
                    {roles.map((role, i) => (
                      editingIdx === i ? (
                        <div key={i} className="border border-[var(--accent-blue)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3">
                          <input value={role.name} onChange={(e) => { const updated = [...roles]; updated[i] = { ...role, name: e.target.value }; setRoles(updated); }} placeholder="Company name" className={inputCls} autoFocus />
                          <input value={role.title} onChange={(e) => { const updated = [...roles]; updated[i] = { ...role, title: e.target.value }; setRoles(updated); }} placeholder="Your title" className={inputCls} />
                          <div>
                            <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5" /> Chat platform
                            </label>
                            <div className="flex gap-2">
                              {["Slack", "Teams", "Other"].map((p) => {
                                const selected = role.platforms.includes(p);
                                return (
                                  <button key={p} type="button" onClick={() => { const updated = [...roles]; updated[i] = { ...role, platforms: selected ? role.platforms.filter((x) => x !== p) : [...role.platforms, p] }; setRoles(updated); }}
                                    className={`px-4 py-2 rounded-lg text-[14px] border transition-all ${selected ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]" : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"}`}
                                  >{p}</button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Palette className="h-4 w-4 text-[var(--text-tertiary)]" />
                            <div className="flex gap-1.5 flex-wrap">
                              {COLOR_PRESETS.map((c) => (
                                <button key={c} type="button" onClick={() => { const updated = [...roles]; updated[i] = { ...role, color: c }; setRoles(updated); }}
                                  className="w-6 h-6 rounded-full border-2 transition-all"
                                  style={{ backgroundColor: c, borderColor: role.color === c ? "white" : "transparent" }}
                                />
                              ))}
                            </div>
                          </div>
                          <button onClick={() => setEditingIdx(null)} className="w-full py-2 rounded-xl bg-[var(--accent-blue)] text-white text-[14px] font-medium hover:opacity-90">
                            Done
                          </button>
                        </div>
                      ) : (
                        <div key={i} onClick={() => setEditingIdx(i)} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] cursor-pointer hover:border-[var(--border-default)] transition-colors">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-medium text-[var(--text-primary)]">{role.name}</p>
                            <p className="text-[13px] text-[var(--text-tertiary)]">{role.title}{role.platforms.length > 0 ? ` (${role.platforms.join(", ")})` : ""}</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeRole(i); }} className="text-[var(--text-tertiary)] hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      )
                    ))}
                  </div>
                )}

                {/* Add form */}
                <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3">
                  <input value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} placeholder="Company name" className={inputCls} />
                  <input value={newRole.title} onChange={(e) => setNewRole({ ...newRole, title: e.target.value })} placeholder="Your title (e.g., Senior Engineer)" className={inputCls} onKeyDown={(e) => e.key === "Enter" && addRole()} />
                  <div>
                    <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" /> Chat platform
                    </label>
                    <div className="flex gap-2">
                      {["Slack", "Teams", "Other"].map((p) => {
                        const selected = newRole.platforms.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setNewRole({
                              ...newRole,
                              platforms: selected
                                ? newRole.platforms.filter((x) => x !== p)
                                : [...newRole.platforms, p],
                            })}
                            className={`px-4 py-2 rounded-lg text-[14px] border transition-all ${
                              selected
                                ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                                : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-[var(--text-tertiary)]" />
                    <div className="flex gap-1.5 flex-wrap">
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setNewRole({ ...newRole, color: c })}
                          className="w-6 h-6 rounded-full border-2 transition-all"
                          style={{ backgroundColor: c, borderColor: newRole.color === c ? "white" : "transparent" }}
                        />
                      ))}
                    </div>
                  </div>
                  <button onClick={addRole} disabled={!newRole.name.trim() || !newRole.title.trim()} className="w-full py-2.5 rounded-xl border border-dashed border-[var(--border-default)] text-[14px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] disabled:opacity-30 flex items-center justify-center gap-1.5">
                    <Plus className="h-4 w-4" /> Add company
                  </button>
                </div>

                <div className="flex gap-3 mt-8">
                  <button onClick={prev} className="px-5 py-3 rounded-xl text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><ArrowLeft className="inline h-4 w-4 mr-1" /> Back</button>
                  <button onClick={handleSaveCompanies} disabled={roles.length === 0 || saving} className="flex-1 bg-[var(--accent-blue)] text-white py-3 rounded-xl text-[15px] font-semibold hover:opacity-90 disabled:opacity-50">
                    {saving ? "Saving..." : `Continue with ${roles.length} compan${roles.length === 1 ? "y" : "ies"}`}
                  </button>
                </div>
              </div>
            )}

            {/* Schedule */}
            {step === "schedule" && (
              <div>
                <h2 className="text-[28px] font-bold text-[var(--text-primary)] mb-2">Configure your schedule</h2>
                <p className="text-[15px] text-[var(--text-tertiary)] mb-4">Divide your day into focused blocks, each dedicated to one company.</p>
                <div className="rounded-xl bg-[var(--accent-blue)]/5 border border-[var(--accent-blue)]/15 px-4 py-3 mb-6">
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                    <strong className="text-[var(--text-primary)]">How it works:</strong> Conductor uses your schedule to show only the tasks and context for the company you should be focusing on right now. This keeps you from being overwhelmed by all your roles at once. During each block, you&apos;ll see that company&apos;s tasks, follow-ups, and AI context — nothing else.
                  </p>
                </div>

                <div className="space-y-3 mb-4">
                  {scheduleBlocks.map((block, i) => (
                    <div key={i} className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          value={block.label}
                          onChange={(e) => updateBlock(i, { label: e.target.value })}
                          placeholder="Block name (e.g., Morning Focus)"
                          className={`${inputCls} flex-1`}
                        />
                        <button onClick={() => removeBlock(i)} className="text-[var(--text-tertiary)] hover:text-red-400 shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                        <div className="flex items-center gap-2 flex-1">
                          <select
                            value={`${block.startHour}:${String(block.startMinute).padStart(2, "0")}`}
                            onChange={(e) => {
                              const [h, m] = e.target.value.split(":").map(Number);
                              updateBlock(i, { startHour: h, startMinute: m });
                            }}
                            className={`${inputCls} flex-1`}
                          >
                            {Array.from({ length: 48 }, (_, j) => {
                              const h = Math.floor(j / 2) + 5;
                              const m = (j % 2) * 30;
                              if (h > 23) return null;
                              return <option key={j} value={`${h}:${String(m).padStart(2, "0")}`}>{formatTime(h, m)}</option>;
                            })}
                          </select>
                          <span className="text-[var(--text-tertiary)] text-[14px]">to</span>
                          <select
                            value={`${block.endHour}:${String(block.endMinute).padStart(2, "0")}`}
                            onChange={(e) => {
                              const [h, m] = e.target.value.split(":").map(Number);
                              updateBlock(i, { endHour: h, endMinute: m });
                            }}
                            className={`${inputCls} flex-1`}
                          >
                            {Array.from({ length: 48 }, (_, j) => {
                              const h = Math.floor(j / 2) + 5;
                              const m = (j % 2) * 30;
                              if (h > 23) return null;
                              return <option key={j} value={`${h}:${String(m).padStart(2, "0")}`}>{formatTime(h, m)}</option>;
                            })}
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {savedRoles.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => updateBlock(i, { roleId: r.id })}
                            className={`px-3 py-1.5 rounded-lg text-[13px] border transition-all flex items-center gap-1.5 ${
                              block.roleId === r.id
                                ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--text-primary)]"
                                : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                            }`}
                          >
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                            {r.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={addBlock} className="w-full py-2.5 rounded-xl border border-dashed border-[var(--border-default)] text-[14px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] flex items-center justify-center gap-1.5 mb-6">
                  <Plus className="h-4 w-4" /> Add time block
                </button>

                <div className="flex gap-3 mt-8">
                  <button onClick={prev} className="px-5 py-3 rounded-xl text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><ArrowLeft className="inline h-4 w-4 mr-1" /> Back</button>
                  <button onClick={handleSaveSchedule} disabled={saving} className="flex-1 bg-[var(--accent-blue)] text-white py-3 rounded-xl text-[15px] font-semibold hover:opacity-90 disabled:opacity-50">
                    {saving ? "Saving..." : "Continue"}
                  </button>
                </div>
              </div>
            )}

            {/* Profile (skippable) */}
            {step === "profile" && (
              <div>
                <h2 className="text-[28px] font-bold text-[var(--text-primary)] mb-2">Your voice</h2>
                <p className="text-[15px] text-[var(--text-tertiary)] mb-6">Describe your general communication style. You can also set per-company tone and context in Settings after setup.</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 block">Communication style</label>
                    <textarea value={commStyle} onChange={(e) => setCommStyle(e.target.value)} placeholder="How do you write? Direct? Casual? Describe your patterns..." className={`${inputCls} min-h-[100px] resize-y py-3`} />
                  </div>
                  <div>
                    <label className="text-[13px] text-[var(--text-tertiary)] mb-1.5 block">About you</label>
                    <textarea value={aboutMe} onChange={(e) => setAboutMe(e.target.value)} placeholder="Anything the AI should always know about you..." className={`${inputCls} min-h-[80px] resize-y py-3`} />
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={prev} className="px-5 py-3 rounded-xl text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><ArrowLeft className="inline h-4 w-4 mr-1" /> Back</button>
                  <button onClick={handleSaveProfile} disabled={saving} className="flex-1 bg-[var(--accent-blue)] text-white py-3 rounded-xl text-[15px] font-semibold hover:opacity-90 disabled:opacity-50">
                    {saving ? "Saving..." : "Continue"}
                  </button>
                </div>
              </div>
            )}

            {/* Done */}
            {step === "done" && (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-6">
                  <Check className="h-8 w-8 text-[var(--accent-blue)]" />
                </div>
                <h2 className="text-[28px] font-bold text-[var(--text-primary)] mb-3">You&apos;re all set</h2>
                <p className="text-[15px] text-[var(--text-tertiary)] mb-10">Conductor is ready. You can configure more in Settings anytime.</p>
                <button onClick={handleFinish} className="bg-[var(--accent-blue)] text-white px-8 py-3.5 rounded-xl text-[16px] font-semibold hover:opacity-90 transition-opacity">
                  Open Conductor <ArrowRight className="inline h-4 w-4 ml-1" />
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
