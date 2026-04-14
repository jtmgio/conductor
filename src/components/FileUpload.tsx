"use client";

import { useState, useCallback } from "react";
import { Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  roleId: string;
  onFileProcessed: (data: { filename: string; text?: string; base64?: string; mimeType: string; uploadId?: string; noteId?: string }) => void;
}

export function FileUpload({ roleId, onFileProcessed }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { alert("File exceeds 10MB limit"); return; }
    setUploading(true);
    try { const formData = new FormData(); formData.append("file", file); formData.append("roleId", roleId); const res = await fetch("/api/files/upload", { method: "POST", body: formData }); const data = await res.json(); onFileProcessed({ filename: file.name, text: data.extractedText, base64: data.base64, mimeType: file.type, uploadId: data.id, noteId: data.noteId }); } catch {}
    setUploading(false);
  }, [roleId, onFileProcessed]);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) handleFile(file); }, [handleFile]);
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = ""; }, [handleFile]);

  return (
    <label onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}
      className={cn("flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-xl cursor-pointer transition-colors",
        dragging ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5" : "border-[var(--border-default)] hover:border-[var(--text-tertiary)]"
      )}
    >
      <input type="file" className="hidden" accept="image/*,.pdf,.docx,.doc,.txt,.md,.csv" onChange={handleInput} />
      {uploading ? <Loader2 className="h-5 w-5 text-[var(--text-tertiary)] animate-spin" /> : (
        <>
          <Upload className={cn("h-5 w-5 mb-1", dragging ? "text-[var(--accent-blue)]" : "text-[var(--text-tertiary)]")} />
          <p className="text-[15px] text-[var(--text-tertiary)]">Drop files or tap to upload</p>
          <p className="text-[13px] text-[var(--text-tertiary)] opacity-60">PDF, Word, images up to 10MB</p>
        </>
      )}
    </label>
  );
}
