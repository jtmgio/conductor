"use client";

import { useState, useRef, useCallback } from "react";
import { FileUpload } from "./FileUpload";
import { ConfirmExtract } from "./ConfirmExtract";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Role { id: string; name: string; color: string; }
interface ExtractedData { tasks: Array<{ title: string; priority: string }>; followUps: Array<{ title: string; waitingOn: string }>; decisions: Array<{ summary: string }>; keyQuotes: Array<{ text: string; speaker?: string }>; }
interface InboxProcessorProps { roles: Role[]; }

export function InboxProcessor({ roles }: InboxProcessorProps) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id || "");
  const [content, setContent] = useState("");
  const [processing, setProcessing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [sourceInfo, setSourceInfo] = useState<{ sourceType: string; sourceId: string } | null>(null);
  const [quickAddMode, setQuickAddMode] = useState<"task" | "followup" | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickWaitingOn, setQuickWaitingOn] = useState("");
  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(160, el.scrollHeight) + "px";
  }, []);

  const handleProcess = async () => {
    if (!content.trim() || !selectedRoleId) return;
    setProcessing(true);
    try {
      // Save transcript first
      const transcriptRes = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: selectedRoleId, rawText: content }),
      });
      if (!transcriptRes.ok) throw new Error("Failed to save transcript");
      const transcript = await transcriptRes.json();
      setSourceInfo({ sourceType: "transcript", sourceId: transcript.id });

      // Extract structured data
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: selectedRoleId, content, contentType: "transcript" }),
      });
      if (!res.ok) throw new Error("Extraction failed");
      setExtracted(await res.json());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Processing failed", "error");
    }
    setProcessing(false);
  };

  const handleFileProcessed = async (fileData: { filename: string; text?: string; base64?: string; mimeType: string; uploadId?: string }) => {
    if (!fileData.text && !fileData.base64) {
      toast("No content could be extracted from this file", "error");
      return;
    }
    setProcessing(true);
    if (fileData.uploadId) {
      setSourceInfo({ sourceType: "file", sourceId: fileData.uploadId });
    }
    try {
      const isImage = fileData.mimeType?.startsWith("image/");
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: selectedRoleId,
          contentType: isImage ? "screenshot" : "file",
          ...(isImage
            ? { base64: fileData.base64, mimeType: fileData.mimeType }
            : { content: fileData.text }),
        }),
      });
      if (!res.ok) throw new Error("Extraction failed");
      setExtracted(await res.json());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Processing failed", "error");
    }
    setProcessing(false);
  };

  const handleConfirm = async (data: ExtractedData) => {
    try {
      const promises: Promise<Response>[] = [];
      for (const task of data.tasks) {
        promises.push(fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleId: selectedRoleId,
            title: task.title,
            priority: task.priority,
            ...(sourceInfo && { sourceType: sourceInfo.sourceType, sourceId: sourceInfo.sourceId }),
          }),
        }));
      }
      for (const fu of data.followUps) {
        promises.push(fetch("/api/followups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleId: selectedRoleId,
            title: fu.title,
            waitingOn: fu.waitingOn,
            ...(sourceInfo && { sourceType: sourceInfo.sourceType, sourceId: sourceInfo.sourceId }),
          }),
        }));
      }
      const noteContent = [
        ...data.decisions.map((d) => `Decision: ${d.summary}`),
        ...data.keyQuotes.map((q) => `Quote: "${q.text}"${q.speaker ? ` — ${q.speaker}` : ""}`),
      ].join("\n");
      if (noteContent) {
        promises.push(fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId: selectedRoleId, content: noteContent, tags: ["extracted"] }),
        }));
      }

      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toast(`${failed.length} item(s) failed to save`, "error");
      } else {
        const count = data.tasks.length + data.followUps.length + (noteContent ? 1 : 0);
        toast(`Saved ${count} item${count !== 1 ? "s" : ""}`, "success");
      }
    } catch {
      toast("Failed to save items", "error");
    }
    setExtracted(null);
    setSourceInfo(null);
    setContent("");
  };

  const handleQuickAdd = async () => {
    if (!quickTitle.trim()) return;
    try {
      let res: Response;
      if (quickAddMode === "task") {
        res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selectedRoleId, title: quickTitle }) });
      } else {
        res = await fetch("/api/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: selectedRoleId, title: quickTitle, waitingOn: quickWaitingOn || "Unknown" }) });
      }
      if (!res.ok) throw new Error("Failed to save");
      toast(`${quickAddMode === "task" ? "Task" : "Follow-up"} added`, "success");
    } catch {
      toast("Failed to save", "error");
    }
    setQuickTitle("");
    setQuickWaitingOn("");
    setQuickAddMode(null);
  };

  if (processing) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-[var(--border-default)] border-t-[var(--accent-blue)] animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)]">Processing</p>
          <p className="text-[14px] text-[var(--text-tertiary)] mt-1">Extracting tasks, follow-ups, and key decisions...</p>
        </div>
      </div>
    );
  }

  if (extracted) return <ConfirmExtract data={extracted} roleId={selectedRoleId} roleColor={selectedRole?.color || "#4d8ef7"} roleName={selectedRole?.name || ""} onConfirm={handleConfirm} onDiscard={() => { setExtracted(null); setSourceInfo(null); setContent(""); }} />;

  const inputCls = "w-full rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] px-4 py-2.5 text-[16px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all placeholder:text-[var(--text-tertiary)]";

  return (
    <div className="space-y-4">
      <textarea ref={textareaRef} value={content} onChange={(e) => { setContent(e.target.value); autoResize(); }} placeholder="Paste a transcript, meeting notes, or anything..." className={`${inputCls} min-h-[160px] max-h-[60vh] resize-none overflow-y-auto`} />
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
      <button onClick={handleProcess} disabled={!content.trim() || processing} className="w-full py-3 bg-[#4d8ef7] text-white text-[17px] font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed mt-4">
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
            <button onClick={() => setQuickAddMode("task")} className="flex-1 flex items-center justify-center gap-1.5 border border-[var(--border-default)] rounded-xl py-2.5 text-[16px] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"><Plus className="h-3.5 w-3.5" /> Add task manually</button>
            <button onClick={() => setQuickAddMode("followup")} className="flex-1 flex items-center justify-center gap-1.5 border border-[var(--border-default)] rounded-xl py-2.5 text-[16px] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"><Plus className="h-3.5 w-3.5" /> Add follow-up manually</button>
          </div>
        )}
      </div>
    </div>
  );
}
