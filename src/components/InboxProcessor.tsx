"use client";

import { useState } from "react";
import { FileUpload } from "./FileUpload";
import { ConfirmExtract } from "./ConfirmExtract";
import { Loader2, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Role { id: string; name: string; color: string; }
interface ExtractedData { tasks: Array<{ title: string; priority: string }>; followUps: Array<{ title: string; waitingOn: string }>; decisions: Array<{ summary: string }>; keyQuotes: Array<{ text: string; speaker?: string }>; }
interface InboxProcessorProps { roles: Role[]; }

export function InboxProcessor({ roles }: InboxProcessorProps) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id || "");
  const [content, setContent] = useState("");
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [quickAddMode, setQuickAddMode] = useState<"task" | "followup" | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickWaitingOn, setQuickWaitingOn] = useState("");
  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  const handleProcess = async () => { if (!content.trim() || !selectedRoleId) return; setProcessing(true); try { const res = await fetch("/api/ai/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selectedRoleId, content, contentType: "transcript" }) }); setExtracted(await res.json()); } catch {} setProcessing(false); };
  const handleFileProcessed = async (fileData: { text?: string; base64?: string; mimeType: string; uploadId?: string }) => { if (!fileData.text) return; setProcessing(true); try { const res = await fetch("/api/ai/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selectedRoleId, content: fileData.text, contentType: "file" }) }); setExtracted(await res.json()); } catch {} setProcessing(false); };

  const handleConfirm = async (data: ExtractedData) => {
    const promises: Promise<Response>[] = [];
    for (const task of data.tasks) promises.push(fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selectedRoleId, title: task.title, priority: task.priority }) }));
    for (const fu of data.followUps) promises.push(fetch("/api/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selectedRoleId, title: fu.title, waitingOn: fu.waitingOn }) }));
    const noteContent = [...data.decisions.map((d) => `Decision: ${d.summary}`), ...data.keyQuotes.map((q) => `Quote: "${q.text}"${q.speaker ? ` — ${q.speaker}` : ""}`)].join("\n");
    if (noteContent) promises.push(fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selectedRoleId, content: noteContent, tags: ["extracted"] }) }));
    await Promise.all(promises); setExtracted(null); setContent("");
  };

  const handleQuickAdd = async () => {
    if (!quickTitle.trim()) return;
    if (quickAddMode === "task") await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selectedRoleId, title: quickTitle }) });
    else if (quickAddMode === "followup") await fetch("/api/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selectedRoleId, title: quickTitle, waitingOn: quickWaitingOn || "Unknown" }) });
    setQuickTitle(""); setQuickWaitingOn(""); setQuickAddMode(null);
  };

  if (extracted) return <ConfirmExtract data={extracted} roleId={selectedRoleId} roleColor={selectedRole?.color || "#4d8ef7"} roleName={selectedRole?.name || ""} onConfirm={handleConfirm} onDiscard={() => { setExtracted(null); setContent(""); }} />;

  const inputCls = "w-full rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] px-4 py-2.5 text-[15px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all placeholder:text-[var(--text-tertiary)]";

  return (
    <div className="space-y-4">
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste a transcript, meeting notes, or anything..." className={`${inputCls} min-h-[160px] resize-none`} />
      <FileUpload roleId={selectedRoleId} onFileProcessed={handleFileProcessed} />
      <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
        <SelectTrigger className="w-full rounded-xl border-[var(--border-subtle)] bg-[var(--surface-raised)] h-11 text-[15px] text-[var(--text-primary)]">
          <SelectValue placeholder="Select role..." />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />{role.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button onClick={handleProcess} disabled={!content.trim() || processing} className="w-full py-3 bg-[var(--accent-blue)] text-white font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed mt-4">
        {processing ? <span className="inline-flex items-center"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</span> : "Process"}
      </button>
      <div className="pt-2">
        {quickAddMode ? (
          <div className="space-y-2">
            <input value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} placeholder={quickAddMode === "task" ? "Task title..." : "Follow-up title..."} onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()} autoFocus className={inputCls} />
            {quickAddMode === "followup" && <input value={quickWaitingOn} onChange={(e) => setQuickWaitingOn(e.target.value)} placeholder="Waiting on..." className={inputCls} />}
            <div className="flex gap-2">
              <button onClick={handleQuickAdd} className="px-4 py-2 rounded-xl bg-[var(--accent-blue)] text-white text-[14px] font-medium hover:opacity-90 transition-opacity">Add</button>
              <button onClick={() => setQuickAddMode(null)} className="px-4 py-2 rounded-xl text-[var(--text-secondary)] text-[14px] font-medium hover:bg-[var(--sidebar-hover)] transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => setQuickAddMode("task")} className="flex-1 flex items-center justify-center gap-1.5 border border-[var(--border-default)] rounded-xl py-2.5 text-[14px] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"><Plus className="h-3.5 w-3.5" /> Add task manually</button>
            <button onClick={() => setQuickAddMode("followup")} className="flex-1 flex items-center justify-center gap-1.5 border border-[var(--border-default)] rounded-xl py-2.5 text-[14px] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"><Plus className="h-3.5 w-3.5" /> Add follow-up manually</button>
          </div>
        )}
      </div>
    </div>
  );
}
