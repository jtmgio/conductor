"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCw, Users, Clock, Loader2, Check, MessageSquare, FileText, ListTodo, Plus, Trash2, Sparkles, ScrollText, Search, Download, ArrowRight, Paperclip } from "lucide-react";
import { FileIcon, formatFileSize } from "@/lib/file-utils";
import { DocumentViewer, type ViewerFile } from "./DocumentViewer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NoteEditor } from "./NoteEditor";
import { ChatThread } from "./ChatThread";
import { ConfirmExtract } from "./ConfirmExtract";
import { FontSizeControl } from "./FontSizeControl";
import { useFontSize } from "@/hooks/useFontSize";
import { useToast } from "@/components/ui/toast";

interface TranscriptData {
  id: string;
  title: string | null;
  rawText: string;
  summary: string | null;
  sourceId: string | null;
  processedAt: string | null;
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  roleId: string;
  meetingNoteId?: string | null;
  transcriptId?: string | null;
  transcript?: TranscriptData | null;
  aiPrepContent?: string | null;
  role: { id: string; name: string; color: string };
}

interface MeetingPrepPanelProps {
  meeting: Meeting;
  open: boolean;
  onClose: () => void;
}

interface MeetingTask {
  id: string;
  title: string;
  done: boolean;
  priority: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface GranolaMatch {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
  folder: string | null;
}

interface ExtractedData {
  tasks: Array<{ title: string; priority: string }>;
  followUps: Array<{ title: string; waitingOn: string }>;
  decisions: Array<{ summary: string }>;
  keyQuotes: Array<{ text: string; speaker?: string }>;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

type TabId = "prep" | "notes" | "transcript" | "chat" | "tasks" | "files";

export function MeetingPrepPanel({ meeting, open, onClose }: MeetingPrepPanelProps) {
  // Shared state
  const [activeTab, setActiveTab] = useState<TabId>("prep");
  const [aiPrep, setAiPrep] = useState<string | null>(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const font = useFontSize("meeting-drawer");
  const { toast } = useToast();

  // Notes state
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);

  // Tasks state
  const [meetingTasks, setMeetingTasks] = useState<MeetingTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [tasksLoaded, setTasksLoaded] = useState(false);

  // Transcript state
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [granolaMatch, setGranolaMatch] = useState<{ match: GranolaMatch | null; unimported: GranolaMatch[] } | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [transcriptFilter, setTranscriptFilter] = useState("");

  // Files state
  const [meetingFiles, setMeetingFiles] = useState<ViewerFile[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [viewerFile, setViewerFile] = useState<ViewerFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data Loading ──

  // Fetch fresh meeting data on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadMeetingData() {
      try {
        const res = await fetch(`/api/meetings/${meeting.id}`);
        if (!res.ok || cancelled) return;
        const fresh = await res.json();

        // Load AI prep
        if (fresh.aiPrepContent) {
          setAiPrep(fresh.aiPrepContent);
        } else {
          fetchPrep();
        }

        // Load transcript if linked
        if (fresh.transcript) {
          setTranscript(fresh.transcript);
        }

        // Load existing note
        if (fresh.meetingNoteId) {
          setNoteId(fresh.meetingNoteId);
          const noteRes = await fetch(`/api/notes/${fresh.meetingNoteId}`);
          if (noteRes.ok && !cancelled) {
            const note = await noteRes.json();
            setNoteContent(note.content || "");
          }
        } else {
          setNoteContent("");
          setNoteId(null);
        }
      } catch {}
      if (!cancelled) setNoteLoaded(true);
    }

    loadMeetingData();
    return () => { cancelled = true; };
  }, [open, meeting.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load chat history when panel opens (eagerly, not just on tab switch)
  useEffect(() => {
    if (!open || chatLoaded) return;

    async function loadChat() {
      try {
        const res = await fetch(`/api/conversations/${meeting.roleId}`);
        if (res.ok) {
          const data = await res.json();
          const threads = data.threads || [];
          const meetingThread = threads.find((t: { meetingId?: string }) => t.meetingId === meeting.id);

          if (meetingThread) {
            setChatThreadId(meetingThread.id);
            const msgRes = await fetch(`/api/conversations/${meeting.roleId}/threads/${meetingThread.id}`);
            if (msgRes.ok) {
              const data = await msgRes.json();
              setChatMessages(data.messages || []);
            }
          }
        }
      } catch {}
      setChatLoaded(true);
    }

    loadChat();
  }, [open, chatLoaded, meeting.id, meeting.roleId]);

  // Load tasks when switching to tasks tab
  useEffect(() => {
    if (activeTab !== "tasks" || tasksLoaded) return;
    loadTasks();
  }, [activeTab, tasksLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load files when switching to files tab
  useEffect(() => {
    if (activeTab !== "files" || filesLoaded) return;
    loadFiles();
  }, [activeTab, filesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI Prep ──

  const fetchPrep = useCallback(async () => {
    setPrepLoading(true);
    try {
      const res = await fetch("/api/ai/meeting-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: meeting.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiPrep(data.prep);
        await fetch(`/api/meetings/${meeting.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiPrepContent: data.prep }),
        });
        if (!noteId) ensureNoteExists();
      }
    } catch {}
    setPrepLoading(false);
  }, [meeting.id, noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notes ──

  const ensureNoteExists = useCallback(async () => {
    if (noteId) return noteId;
    const tags = ["meeting", `meeting:${meeting.date}`, `meeting:${slugify(meeting.title)}`];
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: meeting.roleId, content: "", tags }),
      });
      if (res.ok) {
        const created = await res.json();
        setNoteId(created.id);
        await fetch(`/api/meetings/${meeting.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingNoteId: created.id }),
        });
        return created.id;
      }
    } catch {}
    return null;
  }, [noteId, meeting.id, meeting.date, meeting.title, meeting.roleId]);

  const saveNote = useCallback(async (html: string) => {
    if (isSavingRef.current) return;
    if (!html || html === "<p></p>") return;
    isSavingRef.current = true;
    setSaveStatus("saving");
    try {
      let currentNoteId = noteId;
      if (!currentNoteId) currentNoteId = await ensureNoteExists();
      if (currentNoteId) {
        await fetch(`/api/notes/${currentNoteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: html }),
        });
      }
      setSaveStatus("saved");
    } catch { setSaveStatus("idle"); }
    isSavingRef.current = false;
  }, [noteId, ensureNoteExists]);

  const handleNoteChange = useCallback((html: string) => {
    setNoteContent(html);
    setSaveStatus("idle");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNote(html), 1000);
  }, [saveNote]);

  // ── Chat ──

  const handleSendMessage = useCallback(async (message: string) => {
    setChatMessages((prev) => [...prev, { role: "user", content: message, timestamp: new Date().toISOString() }]);
    setChatLoading(true);
    try {
      const body: Record<string, string | null> = { message, meetingId: meeting.id };
      if (chatThreadId) body.threadId = chatThreadId;

      const res = await fetch(`/api/conversations/${meeting.roleId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [...prev, { role: "assistant", content: data.response, timestamp: new Date().toISOString() }]);
        if (data.threadId && !chatThreadId) setChatThreadId(data.threadId);
      }
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Failed to get response. Please try again.", timestamp: new Date().toISOString() }]);
    }
    setChatLoading(false);
  }, [meeting.id, meeting.roleId, chatThreadId]);

  const handleClearChat = useCallback(() => {
    setChatMessages([]);
    if (chatThreadId) {
      fetch(`/api/conversations/${meeting.roleId}?threadId=${chatThreadId}`, { method: "DELETE" }).catch(() => {});
      setChatThreadId(null);
    }
  }, [chatThreadId, meeting.roleId]);

  // ── Tasks ──

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?roleId=${meeting.roleId}&sourceType=meeting&sourceId=meeting-${meeting.id}&includeDone=true`);
      if (res.ok) {
        const data = await res.json();
        setMeetingTasks(Array.isArray(data) ? data : []);
      }
    } catch {}
    setTasksLoaded(true);
  }, [meeting.roleId, meeting.id]);

  const addTask = useCallback(async () => {
    if (!newTaskTitle.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: meeting.roleId,
          title: newTaskTitle.trim(),
          isToday: true,
          sourceType: "meeting",
          sourceId: `meeting-${meeting.id}`,
        }),
      });
      if (res.ok) {
        const task = await res.json();
        setMeetingTasks((prev) => [...prev, task]);
        setNewTaskTitle("");
        toast("Task added", "success");
      }
    } catch { toast("Failed to add task", "error"); }
  }, [newTaskTitle, meeting.roleId, meeting.id, toast]);

  const toggleTask = useCallback(async (taskId: string, done: boolean) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !done }),
      });
      if (!done) {
        setTimeout(() => setMeetingTasks((prev) => prev.filter((t) => t.id !== taskId)), 300);
      } else {
        setMeetingTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, done: !done } : t));
      }
    } catch {}
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      setMeetingTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {}
  }, []);

  // ── Files ──

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/files`);
      if (res.ok) setMeetingFiles(await res.json());
    } catch {}
    setFilesLoaded(true);
  }, [meeting.id]);

  const uploadMeetingFile = useCallback(async (file: globalThis.File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast("File exceeds 10MB limit", "error");
      return;
    }
    setFileUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/meetings/${meeting.id}/files`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const uploaded = await res.json();
        setMeetingFiles((prev) => [uploaded, ...prev]);
        toast("File attached", "success");
      } else {
        toast("Failed to upload file", "error");
      }
    } catch {
      toast("Failed to upload file", "error");
    }
    setFileUploading(false);
  }, [meeting.id, toast]);

  const removeMeetingFile = useCallback(async (fileId: string) => {
    try {
      await fetch(`/api/meetings/${meeting.id}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      setMeetingFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {}
  }, [meeting.id]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFileDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadMeetingFile(file);
  }, [uploadMeetingFile]);

  // ── Transcript ──

  const searchGranola = useCallback(async () => {
    setMatchLoading(true);
    try {
      const res = await fetch(`/api/integrations/granola/match?meetingId=${meeting.id}`);
      if (res.ok) {
        const data = await res.json();
        setGranolaMatch(data);
        // If auto-matched, import directly
        if (data.match) {
          await importGranola(data.match.id);
        }
      } else {
        toast("Failed to search Granola", "error");
      }
    } catch {
      toast("Failed to connect to Granola", "error");
    }
    setMatchLoading(false);
  }, [meeting.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const importGranola = useCallback(async (granolaId: string) => {
    setImportLoading(true);
    try {
      const res = await fetch("/api/integrations/granola/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granolaId, meetingId: meeting.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranscript(data);
        setGranolaMatch(null);
        toast("Transcript imported", "success");
      } else {
        toast("Failed to import transcript", "error");
      }
    } catch {
      toast("Failed to import transcript", "error");
    }
    setImportLoading(false);
  }, [meeting.id, toast]);

  const extractFromTranscript = useCallback(async () => {
    if (!transcript) return;
    setExtracting(true);
    try {
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: meeting.roleId,
          content: transcript.rawText,
          contentType: "transcript",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setExtractedData(data);
      } else {
        toast("Failed to extract from transcript", "error");
      }
    } catch {
      toast("Failed to extract from transcript", "error");
    }
    setExtracting(false);
  }, [transcript, meeting.roleId, toast]);

  const handleConfirmExtract = useCallback(async (data: ExtractedData) => {
    // Create tasks
    for (const task of data.tasks) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: meeting.roleId,
          title: task.title,
          priority: task.priority,
          isToday: true,
          sourceType: "meeting",
          sourceId: `meeting-${meeting.id}`,
        }),
      }).catch(() => {});
    }

    // Create follow-ups
    for (const fu of data.followUps) {
      await fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: meeting.roleId,
          title: fu.title,
          waitingOn: fu.waitingOn,
          sourceType: "meeting",
          sourceId: `meeting-${meeting.id}`,
        }),
      }).catch(() => {});
    }

    // Mark transcript as processed
    if (transcript) {
      await fetch(`/api/transcripts/${transcript.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processedAt: new Date().toISOString() }),
      }).catch(() => {});
      setTranscript({ ...transcript, processedAt: new Date().toISOString() });
    }

    setExtractedData(null);
    toast(`Created ${data.tasks.length} tasks and ${data.followUps.length} follow-ups`, "success");
    // Reload tasks if on tasks tab
    setTasksLoaded(false);
  }, [meeting.roleId, meeting.id, transcript, toast]);

  // ── Close ──

  const handleClose = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (noteContent && noteContent !== "<p></p>") {
      saveNote(noteContent).then(() => toast("Meeting notes saved", "success"));
    }
    onClose();
  }, [noteContent, saveNote, onClose, toast]);

  // Reset state when meeting changes (only on meeting.id change, not on prop updates)
  useEffect(() => {
    setAiPrep(meeting.aiPrepContent || null);
    setSaveStatus("idle");
    setNoteLoaded(false);
    setChatLoaded(false);
    setChatMessages([]);
    setChatThreadId(null);
    setTasksLoaded(false);
    setMeetingTasks([]);
    setTranscript(meeting.transcript || null);
    setGranolaMatch(null);
    setExtractedData(null);
    setTranscriptFilter("");
    setFilesLoaded(false);
    setMeetingFiles([]);
    setActiveTab("prep");
  }, [meeting.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const tabs: Array<{ id: TabId; label: string; icon: typeof Sparkles }> = [
    { id: "prep", label: "AI Prep", icon: Sparkles },
    { id: "notes", label: "Notes", icon: FileText },
    { id: "transcript", label: "Transcript", icon: ScrollText },
    { id: "chat", label: "AI Chat", icon: MessageSquare },
    { id: "tasks", label: "Tasks", icon: ListTodo },
    { id: "files", label: "Files", icon: Paperclip },
  ];

  // Filtered unimported notes for manual pick
  const filteredUnimported = granolaMatch?.unimported.filter((n) => {
    if (!transcriptFilter) return true;
    const q = transcriptFilter.toLowerCase();
    return n.title.toLowerCase().includes(q) || (n.folder && n.folder.toLowerCase().includes(q));
  }) || [];

  return (
    <>
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={handleClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full md:w-3/4 bg-[var(--surface)] border-l border-[var(--border-subtle)] z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 px-6 py-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-[18px] font-semibold text-[var(--text-primary)] truncate">
                    {meeting.title}
                  </h2>
                  <div className="flex items-center gap-3 mt-1.5 text-[13px] text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1.5" style={{ color: meeting.role.color }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meeting.role.color }} />
                      {meeting.role.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(meeting.startTime)} – {formatTime(meeting.endTime)}
                    </span>
                    {meeting.attendees.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {meeting.attendees.length}
                      </span>
                    )}
                  </div>
                  {meeting.attendees.length > 0 && (
                    <p className="text-[12px] text-[var(--text-tertiary)] mt-1 truncate">
                      {meeting.attendees.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <FontSizeControl size={font.size} onIncrease={font.increase} onDecrease={font.decrease} atMin={font.atMin} atMax={font.atMax} />
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Tab Bar */}
            <div className="shrink-0 flex border-b border-[var(--border-subtle)] overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-[var(--accent-blue)] text-[var(--text-primary)]"
                      : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.id === "tasks" && meetingTasks.length > 0 && (
                    <span className="text-[11px] text-[var(--text-tertiary)]">({meetingTasks.filter(t => !t.done).length})</span>
                  )}
                  {tab.id === "transcript" && transcript && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  )}
                  {tab.id === "files" && meetingFiles.length > 0 && (
                    <span className="text-[11px] text-[var(--text-tertiary)]">({meetingFiles.length})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 min-h-0 flex flex-col">

              {/* AI Prep Tab */}
              {activeTab === "prep" && (
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {prepLoading ? (
                    <div className="flex items-center gap-2 py-8 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                      <span className="text-[13px] text-[var(--text-tertiary)]">Generating prep...</span>
                    </div>
                  ) : aiPrep ? (
                    <div className="prose-sm max-w-none text-[var(--text-secondary)] leading-snug [&_h1]:font-semibold [&_h1]:text-[var(--text-primary)] [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h2]:font-semibold [&_h2]:text-[var(--text-primary)] [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-1.5 [&_strong]:text-[var(--text-primary)] [&_hr]:border-[var(--border-subtle)] [&_hr]:my-3 [&_li>p]:mb-0" style={{ fontSize: `${font.size}px` }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiPrep}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Sparkles className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                      <p className="text-[14px] text-[var(--text-tertiary)]">No AI prep generated yet</p>
                      <button onClick={fetchPrep} className="mt-3 px-4 py-2 text-[13px] font-medium text-[var(--accent-blue)] bg-[var(--accent-blue)]/10 rounded-lg hover:bg-[var(--accent-blue)]/20 transition-colors">
                        Generate Prep
                      </button>
                    </div>
                  )}
                  {aiPrep && (
                    <button onClick={fetchPrep} className="mt-4 flex items-center gap-1.5 text-[12px] text-[var(--accent-blue)] hover:underline">
                      <RefreshCw className="h-3 w-3" /> Regenerate
                    </button>
                  )}
                </div>
              )}

              {/* Notes Tab */}
              {activeTab === "notes" && (
                <>
                  <div className="flex-1 min-h-0">
                    {noteLoaded && <NoteEditor content={noteContent} onChange={handleNoteChange} autoFocus={false} />}
                  </div>
                  <div className="shrink-0 px-6 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                    <span className="text-[12px] text-[var(--text-tertiary)]">
                      {saveStatus === "saving" && <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Saving...</span>}
                      {saveStatus === "saved" && <span className="flex items-center gap-1.5 text-green-400"><Check className="h-3 w-3" />Saved</span>}
                      {saveStatus === "idle" && noteId && "Auto-save enabled"}
                    </span>
                    <button onClick={handleClose} className="px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] bg-[var(--surface-raised)] hover:bg-[var(--sidebar-hover)] border border-[var(--border-subtle)] rounded-lg transition-colors">
                      Close & Save
                    </button>
                  </div>
                </>
              )}

              {/* Transcript Tab */}
              {activeTab === "transcript" && (
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* Extract confirmation modal */}
                  {extractedData ? (
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                      <ConfirmExtract
                        data={extractedData}
                        roleId={meeting.roleId}
                        roleColor={meeting.role.color}
                        roleName={meeting.role.name}
                        onConfirm={handleConfirmExtract}
                        onDiscard={() => setExtractedData(null)}
                      />
                    </div>
                  ) : transcript ? (
                    /* State C: Transcript imported */
                    <>
                      <div className="flex-1 overflow-y-auto px-6 py-4" style={{ fontSize: `${font.size}px` }}>
                        {transcript.summary && (
                          <div className="mb-4">
                            <h3 className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Summary</h3>
                            <div className="prose-sm max-w-none text-[var(--text-secondary)] leading-snug [&_p]:mb-1.5 [&_ul]:ml-4 [&_ul]:list-disc [&_strong]:text-[var(--text-primary)]">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{transcript.summary}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                        <div>
                          <h3 className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Full Transcript</h3>
                          <div className="space-y-1 text-[var(--text-secondary)] leading-relaxed">
                            {transcript.rawText.split("\n").map((line, i) => {
                              const speakerMatch = line.match(/^(.+?):\s(.+)$/);
                              if (speakerMatch) {
                                return (
                                  <p key={i}>
                                    <span className="font-medium text-[var(--text-primary)]">{speakerMatch[1]}:</span>{" "}
                                    {speakerMatch[2]}
                                  </p>
                                );
                              }
                              return line.trim() ? <p key={i}>{line}</p> : null;
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 px-6 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                        <span className="text-[12px] text-[var(--text-tertiary)]">
                          {transcript.processedAt ? (
                            <span className="flex items-center gap-1.5 text-green-400"><Check className="h-3 w-3" />Tasks extracted</span>
                          ) : (
                            "Ready for extraction"
                          )}
                        </span>
                        {!transcript.processedAt && (
                          <button
                            onClick={extractFromTranscript}
                            disabled={extracting}
                            className="px-4 py-2 text-[13px] font-medium text-white bg-[var(--accent-blue)] rounded-lg hover:bg-[var(--accent-blue)]/80 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                            Extract Tasks & Follow-ups
                          </button>
                        )}
                      </div>
                    </>
                  ) : granolaMatch && !granolaMatch.match ? (
                    /* State B: No auto-match — show unimported list */
                    <div className="flex-1 overflow-y-auto">
                      <div className="px-6 py-3 border-b border-[var(--border-subtle)]">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                          <input
                            value={transcriptFilter}
                            onChange={(e) => setTranscriptFilter(e.target.value)}
                            placeholder="Filter by title or folder..."
                            className="w-full bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 outline-none placeholder:text-[var(--text-tertiary)]"
                          />
                        </div>
                        <p className="text-[12px] text-[var(--text-tertiary)] mt-2">
                          No auto-match found. Select a Granola meeting to import:
                        </p>
                      </div>
                      <div className="px-6 py-2 space-y-1">
                        {filteredUnimported.length === 0 ? (
                          <div className="text-center py-8">
                            <ScrollText className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                            <p className="text-[14px] text-[var(--text-tertiary)]">
                              {transcriptFilter ? "No matching meetings" : "No unimported Granola meetings found"}
                            </p>
                          </div>
                        ) : (
                          filteredUnimported.map((note) => (
                            <button
                              key={note.id}
                              onClick={() => importGranola(note.id)}
                              disabled={importLoading}
                              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[var(--surface-raised)] transition-colors text-left group"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] text-[var(--text-primary)] truncate">{note.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[12px] text-[var(--text-tertiary)]">
                                    {new Date(note.created_at).toLocaleDateString()} {new Date(note.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                  </span>
                                  {note.folder && (
                                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--text-tertiary)]">{note.folder}</span>
                                  )}
                                </div>
                                {note.summary && (
                                  <p className="text-[12px] text-[var(--text-tertiary)] mt-1 line-clamp-2">{note.summary}</p>
                                )}
                              </div>
                              <Download className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent-blue)] shrink-0 transition-colors" />
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    /* State A: No transcript, not yet searched */
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <ScrollText className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
                        <p className="text-[14px] text-[var(--text-tertiary)] mb-1">No transcript linked</p>
                        <p className="text-[12px] text-[var(--text-tertiary)] mb-4">Import the meeting transcript from Granola</p>
                        <button
                          onClick={searchGranola}
                          disabled={matchLoading}
                          className="px-5 py-2.5 text-[13px] font-medium text-white bg-[var(--accent-blue)] rounded-lg hover:bg-[var(--accent-blue)]/80 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                        >
                          {matchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Import from Granola
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI Chat Tab */}
              {activeTab === "chat" && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <ChatThread
                    roleId={meeting.roleId}
                    roleName={meeting.role.name}
                    roleColor={meeting.role.color}
                    messages={chatMessages}
                    onSendMessage={handleSendMessage}
                    onClearConversation={handleClearChat}
                    loading={chatLoading}
                    threadName={`Meeting: ${meeting.title}`}
                    fontSize={font.size}
                  />
                </div>
              )}

              {/* Tasks Tab */}
              {activeTab === "tasks" && (
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* Add task input */}
                  <div className="shrink-0 px-6 py-3 border-b border-[var(--border-subtle)]">
                    <div className="flex gap-2">
                      <input
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Add an action item..."
                        className="flex-1 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 outline-none placeholder:text-[var(--text-tertiary)]"
                        onKeyDown={(e) => e.key === "Enter" && addTask()}
                      />
                      <button
                        onClick={addTask}
                        disabled={!newTaskTitle.trim()}
                        className="px-3 py-2 rounded-lg bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] text-[13px] font-medium hover:bg-[var(--accent-blue)]/20 transition-colors disabled:opacity-30"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Task list */}
                  <div className="flex-1 overflow-y-auto px-6 py-3">
                    {!tasksLoaded ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                      </div>
                    ) : meetingTasks.length === 0 ? (
                      <div className="text-center py-12">
                        <ListTodo className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                        <p className="text-[14px] text-[var(--text-tertiary)]">No action items yet</p>
                        <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">Add tasks as they come up during the meeting</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {meetingTasks.map((task) => (
                          <div
                            key={task.id}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${task.done ? "opacity-40" : "hover:bg-[var(--surface-raised)]"}`}
                          >
                            <button
                              onClick={() => toggleTask(task.id, task.done)}
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                task.done
                                  ? "bg-green-500/20 border-green-500/50 text-green-400"
                                  : "border-[var(--border-default)] hover:border-[var(--accent-blue)]"
                              }`}
                            >
                              {task.done && <Check className="h-3 w-3" />}
                            </button>
                            <span className={`flex-1 text-[14px] ${task.done ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
                              {task.title}
                            </span>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="p-1 text-[var(--text-tertiary)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Files Tab */}
              {activeTab === "files" && (
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* File list */}
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    {!filesLoaded ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                      </div>
                    ) : meetingFiles.length > 0 ? (
                      <div className="space-y-1.5 mb-4">
                        {meetingFiles.map((file) => (
                          <div key={file.id} onClick={() => setViewerFile(file)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--surface-raised)] group cursor-pointer hover:bg-[var(--sidebar-hover)] transition-colors">
                            <FileIcon mimeType={file.mimeType} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] text-[var(--text-primary)] truncate">{file.filename}</p>
                              <p className="text-[11px] text-[var(--text-tertiary)]">{formatFileSize(file.size)}</p>
                            </div>
                            <a
                              href={`/api/documents/download?fileId=${file.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] hover:bg-[var(--sidebar-hover)] transition-colors opacity-0 group-hover:opacity-100"
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeMeetingFile(file.id); }}
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-400 hover:bg-[var(--sidebar-hover)] transition-colors opacity-0 group-hover:opacity-100"
                              title="Remove"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 mb-4">
                        <Paperclip className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                        <p className="text-[14px] text-[var(--text-tertiary)]">No files attached</p>
                        <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">Attach agendas, decks, or reference docs</p>
                      </div>
                    )}

                    {/* Drop zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setFileDragOver(true); }}
                      onDragLeave={() => setFileDragOver(false)}
                      onDrop={handleFileDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                        fileDragOver
                          ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
                          : "border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
                      }`}
                    >
                      {fileUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                      ) : (
                        <Paperclip className="h-4 w-4 text-[var(--text-tertiary)]" />
                      )}
                      <span className="text-[13px] text-[var(--text-tertiary)]">
                        {fileUploading ? "Uploading..." : "Drop file or click to attach"}
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,.pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.pptx,.ppt,.zip"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadMeetingFile(file);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    <DocumentViewer file={viewerFile} onClose={() => setViewerFile(null)} />
    </>
  );
}
