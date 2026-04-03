"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Upload, ArrowRight, ArrowLeft, Check, Palette } from "lucide-react";

const COLOR_PRESETS = [
  "#4d8ef7", "#2dd4bf", "#a78bfa", "#fbbf24", "#8cbf6e", "#fb7185",
  "#f97316", "#06b6d4", "#ec4899", "#84cc16", "#6366f1", "#14b8a6",
];

interface NewRole {
  name: string;
  title: string;
  platform: string;
  color: string;
}

const STEPS = ["welcome", "password", "companies", "schedule", "profile", "import", "done"] as const;
type Step = typeof STEPS[number];

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [roles, setRoles] = useState<NewRole[]>([]);
  const [newRole, setNewRole] = useState<NewRole>({ name: "", title: "", platform: "Slack", color: COLOR_PRESETS[0] });
  const [commStyle, setCommStyle] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
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
      if (!res.ok) throw new Error();
      next();
    } catch { setPasswordError("Failed to set password"); }
    setSaving(false);
  };

  const addRole = () => {
    if (!newRole.name.trim() || !newRole.title.trim()) return;
    setRoles([...roles, { ...newRole }]);
    setNewRole({ name: "", title: "", platform: "Slack", color: COLOR_PRESETS[(roles.length + 1) % COLOR_PRESETS.length] });
  };

  const removeRole = (idx: number) => {
    setRoles(roles.filter((_, i) => i !== idx));
  };

  const handleSaveCompanies = async () => {
    if (roles.length === 0) return;
    setSaving(true);
    try {
      for (let i = 0; i < roles.length; i++) {
        await fetch("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...roles[i], priority: i + 1 }),
        });
      }
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

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error();
      setStep("done");
    } catch {}
    setImporting(false);
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
                      <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-medium text-[var(--text-primary)]">{role.name}</p>
                          <p className="text-[13px] text-[var(--text-tertiary)]">{role.title} ({role.platform})</p>
                        </div>
                        <button onClick={() => removeRole(i)} className="text-[var(--text-tertiary)] hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add form */}
                <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)] space-y-3">
                  <div className="flex gap-3">
                    <input value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} placeholder="Company name" className={`${inputCls} flex-1`} />
                    <select value={newRole.platform} onChange={(e) => setNewRole({ ...newRole, platform: e.target.value })} className={`${inputCls} w-28`}>
                      <option>Slack</option>
                      <option>Teams</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <input value={newRole.title} onChange={(e) => setNewRole({ ...newRole, title: e.target.value })} placeholder="Your title (e.g., Senior Engineer)" className={inputCls} onKeyDown={(e) => e.key === "Enter" && addRole()} />
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

            {/* Schedule (skippable) */}
            {step === "schedule" && (
              <div>
                <h2 className="text-[28px] font-bold text-[var(--text-primary)] mb-2">Configure your schedule</h2>
                <p className="text-[15px] text-[var(--text-tertiary)] mb-6">Assign companies to time blocks. You can customize this later in Settings.</p>
                <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-[var(--surface-raised)]">
                  <p className="text-[14px] text-[var(--text-tertiary)] text-center py-8">Schedule configuration is available in Settings &gt; System &gt; General after setup.</p>
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={prev} className="px-5 py-3 rounded-xl text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><ArrowLeft className="inline h-4 w-4 mr-1" /> Back</button>
                  <button onClick={next} className="flex-1 bg-[var(--accent-blue)] text-white py-3 rounded-xl text-[15px] font-semibold hover:opacity-90">
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Profile (skippable) */}
            {step === "profile" && (
              <div>
                <h2 className="text-[28px] font-bold text-[var(--text-primary)] mb-2">Your voice</h2>
                <p className="text-[15px] text-[var(--text-tertiary)] mb-6">Help the AI match your communication style. You can skip this and configure later.</p>
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
                    {saving ? "Saving..." : (commStyle || aboutMe ? "Save & Continue" : "Skip")}
                  </button>
                </div>
              </div>
            )}

            {/* Import (optional) */}
            {step === "import" && (
              <div>
                <h2 className="text-[28px] font-bold text-[var(--text-primary)] mb-2">Import existing config</h2>
                <p className="text-[15px] text-[var(--text-tertiary)] mb-6">Have a Conductor export file? Import it to restore your full setup.</p>
                <div className="border border-dashed border-[var(--border-default)] rounded-xl p-8 text-center">
                  <Upload className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="block mx-auto text-[14px] text-[var(--text-secondary)]"
                  />
                  {importFile && (
                    <button onClick={handleImport} disabled={importing} className="mt-4 bg-[var(--accent-blue)] text-white px-6 py-2.5 rounded-xl text-[14px] font-semibold hover:opacity-90 disabled:opacity-50">
                      {importing ? "Importing..." : "Import"}
                    </button>
                  )}
                </div>
                <div className="flex gap-3 mt-8">
                  <button onClick={prev} className="px-5 py-3 rounded-xl text-[15px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"><ArrowLeft className="inline h-4 w-4 mr-1" /> Back</button>
                  <button onClick={next} className="flex-1 bg-[var(--accent-blue)] text-white py-3 rounded-xl text-[15px] font-semibold hover:opacity-90">
                    Skip
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
