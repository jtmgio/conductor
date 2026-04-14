"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { Search, FileText, Sparkles, ChevronDown, ChevronUp, Download, Pin, PinOff, Plus, Trash2, StickyNote, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { NoteEditor } from "@/components/NoteEditor";

// ─── Documents tab types ───
interface Document {
  id: string;
  source: "note" | "file";
  filename: string;
  roleName: string;
  roleId: string;
  roleColor: string;
  fileType: string;
  contentLength: number;
  preview: string;
  summary: string | null;
  pinned: boolean;
  createdAt: string;
  fileUploadId: string | null;
}

// ─── Notes tab types ───
interface Note {
  id: string;
  roleId: string;
  content: string;
  summary: string | null;
  tags: string[];
  pinned: boolean;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  color: string;
}

// ─── Shared helpers ───
function formatSize(chars: number): string {
  if (chars < 1000) return `${chars} chars`;
  if (chars < 100000) return `${(chars / 1000).toFixed(1)}K chars`;
  return `${(chars / 1000).toFixed(0)}K chars`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

// Strip HTML tags for display in the note list
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

// Convert plain text to basic HTML for TipTap (backward compat)
function ensureHtml(content: string): string {
  if (!content) return "";
  // Already HTML
  if (content.includes("<p>") || content.includes("<h") || content.includes("<ul") || content.includes("<ol")) return content;
  // Plain text → wrap lines in <p> tags
  return content.split("\n").map((line) => `<p>${line || "<br>"}</p>`).join("");
}

function noteTitle(content: string): string {
  const text = stripHtml(content);
  const firstLine = text.split("\n")[0]?.trim();
  if (!firstLine) return "New Note";
  return firstLine.length > 60 ? firstLine.slice(0, 60) + "..." : firstLine;
}

function notePreview(content: string): string {
  const text = stripHtml(content);
  const lines = text.split("\n").filter((l) => l.trim());
  const second = lines[1]?.trim() || "";
  return second.length > 80 ? second.slice(0, 80) + "..." : second;
}

const FILE_TYPE_ICONS: Record<string, string> = {
  docx: "\u{1F4C4}", doc: "\u{1F4C4}", pdf: "\u{1F4D5}", txt: "\u{1F4DD}", md: "\u{1F4DD}",
  csv: "\u{1F4CA}", json: "\u{1F4CB}", png: "\u{1F5BC}", jpg: "\u{1F5BC}", jpeg: "\u{1F5BC}",
};

// ─── Notes Panel ───
function NotesPanel({ roles }: { roles: Role[] }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (selectedRole) params.set("roleId", selectedRole);
    try {
      const res = await fetch(`/api/notes?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const userNotes = data.filter((n: Note) => !n.tags.includes("upload") && !n.tags.includes("extracted"));
        setNotes(userNotes);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedRole]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // Search filter (client-side, strip HTML for matching)
  const filtered = searchQuery.trim()
    ? notes.filter((n) => stripHtml(n.content).toLowerCase().includes(searchQuery.toLowerCase()))
    : notes;

  const pinned = filtered.filter((n) => n.pinned);
  const unpinned = filtered.filter((n) => !n.pinned);

  const selectedNote = notes.find((n) => n.id === selectedId);

  // Sync editor content when selection changes
  useEffect(() => {
    if (selectedNote) {
      setEditorContent(ensureHtml(selectedNote.content));
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save handler — called by NoteEditor's internal debounce
  const handleEditorChange = useCallback(async (html: string) => {
    if (!selectedId) return;
    setEditorContent(html);
    setNotes((prev) => prev.map((n) => n.id === selectedId ? { ...n, content: html } : n));
    try {
      await fetch(`/api/notes/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: html }),
      });
    } catch { /* silent */ }
  }, [selectedId]);

  const createNote = async () => {
    const roleId = selectedRole || roles[0]?.id;
    if (!roleId) return;
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, content: "", tags: [] }),
      });
      const note = await res.json();
      setNotes((prev) => [note, ...prev]);
      setSelectedId(note.id);
      setEditorContent("");
    } catch { /* ignore */ }
  };

  const togglePin = async (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, pinned: !n.pinned } : n));
    } catch { /* ignore */ }
  };

  const deleteNote = async (noteId: string) => {
    setDeleting(noteId);
    try {
      await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (selectedId === noteId) {
        setSelectedId(null);
        setEditorContent("");
      }
    } catch { /* ignore */ }
    setDeleting(null);
  };

  const getRoleForNote = (roleId: string) => roles.find((r) => r.id === roleId);

  const NoteRow = ({ note }: { note: Note }) => {
    const role = getRoleForNote(note.roleId);
    const isSelected = selectedId === note.id;
    return (
      <motion.button
        layout
        onClick={() => setSelectedId(note.id)}
        className={cn(
          "w-full text-left px-4 py-3 transition-colors group",
          isSelected
            ? "bg-[var(--accent-blue)]/10"
            : "hover:bg-[var(--surface-overlay)]/50"
        )}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-[14px] font-semibold truncate",
              isSelected ? "text-[var(--accent-blue)]" : "text-[var(--text-primary)]"
            )}>
              {noteTitle(note.content)}
            </p>
            <p className="text-[13px] text-[var(--text-tertiary)] truncate mt-0.5">
              {notePreview(note.content) || "No additional text"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-[var(--text-tertiary)]">{formatDate(note.createdAt)}</span>
              {role && (
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  style={{ backgroundColor: `${role.color}1a`, color: role.color }}
                >
                  {role.name}
                </span>
              )}
            </div>
          </div>
          {note.pinned && (
            <Pin className="h-3 w-3 text-[var(--accent-blue)] shrink-0 mt-1" />
          )}
        </div>
      </motion.button>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[400px]">
      {/* Role filter */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-4 shrink-0">
        <button
          onClick={() => { setSelectedRole(""); setSelectedId(null); }}
          className={cn(
            "px-3 py-2 rounded-xl text-[13px] font-medium border shrink-0 transition-colors",
            !selectedRole
              ? "bg-[var(--accent-blue)] text-white border-transparent"
              : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          )}
        >
          All
        </button>
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => { setSelectedRole(selectedRole === r.id ? "" : r.id); setSelectedId(null); }}
            className={cn(
              "px-3 py-2 rounded-xl text-[13px] font-medium border shrink-0 transition-colors flex items-center gap-1.5",
              selectedRole === r.id
                ? "border-transparent text-white"
                : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            )}
            style={selectedRole === r.id ? { backgroundColor: r.color } : undefined}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
            {r.name}
          </button>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 min-h-0 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--surface-raised)]">
        {/* Left: note list */}
        <div className="w-full lg:w-[320px] lg:min-w-[320px] flex flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
          {/* Search + new */}
          <div className="p-3 flex gap-2 border-b border-[var(--border-subtle)]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-blue)]/40"
              />
            </div>
            <button
              onClick={createNote}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity"
              title="New note"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-[13px] text-[var(--text-tertiary)]">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <StickyNote className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3 opacity-40" />
                <p className="text-[13px] text-[var(--text-tertiary)]">
                  {searchQuery ? "No matching notes" : "No notes yet"}
                </p>
                {!searchQuery && (
                  <button
                    onClick={createNote}
                    className="mt-3 text-[13px] text-[var(--accent-blue)] hover:underline"
                  >
                    Create your first note
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]/50">
                {/* Pinned section */}
                {pinned.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-[var(--surface-sunken)]">
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)] font-semibold flex items-center gap-1">
                        <Pin className="h-2.5 w-2.5" /> Pinned
                      </p>
                    </div>
                    <AnimatePresence>
                      {pinned.map((n) => <NoteRow key={n.id} note={n} />)}
                    </AnimatePresence>
                    {unpinned.length > 0 && (
                      <div className="h-px bg-[var(--border-default)]" />
                    )}
                  </>
                )}
                {/* Unpinned */}
                <AnimatePresence>
                  {unpinned.map((n) => <NoteRow key={n.id} note={n} />)}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Right: editor */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          {selectedNote ? (
            <>
              {/* Editor toolbar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-3">
                  {(() => {
                    const role = getRoleForNote(selectedNote.roleId);
                    return role ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[12px] font-semibold"
                        style={{ backgroundColor: `${role.color}1a`, color: role.color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: role.color }} />
                        {role.name}
                      </span>
                    ) : null;
                  })()}
                  <span className="text-[12px] text-[var(--text-tertiary)]">
                    {new Date(selectedNote.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => togglePin(selectedNote.id)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      selectedNote.pinned
                        ? "text-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)]"
                    )}
                    title={selectedNote.pinned ? "Unpin from AI context" : "Pin to AI context"}
                  >
                    {selectedNote.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => deleteNote(selectedNote.id)}
                    disabled={deleting === selectedNote.id}
                    className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    title="Delete note"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Editor area */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <NoteEditor
                  key={selectedId}
                  content={editorContent}
                  onChange={handleEditorChange}
                  autoFocus
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <StickyNote className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-4 opacity-20" />
                <p className="text-[15px] text-[var(--text-tertiary)]">Select a note or create a new one</p>
                <button
                  onClick={createNote}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-blue)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
                >
                  <Plus className="h-3.5 w-3.5" /> New Note
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile editor (replaces list when note selected) */}
        {selectedNote && (
          <div className="lg:hidden fixed inset-0 z-50 bg-[var(--surface)] flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
              <button
                onClick={() => setSelectedId(null)}
                className="text-[var(--accent-blue)] text-[14px] font-medium"
              >
                Back
              </button>
              <div className="flex-1" />
              <button
                onClick={() => togglePin(selectedNote.id)}
                className={cn(
                  "p-2 rounded-lg",
                  selectedNote.pinned ? "text-[var(--accent-blue)]" : "text-[var(--text-tertiary)]"
                )}
              >
                {selectedNote.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              </button>
              <button
                onClick={() => deleteNote(selectedNote.id)}
                className="p-2 rounded-lg text-[var(--text-tertiary)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <NoteEditor
                key={selectedId}
                content={editorContent}
                onChange={handleEditorChange}
                autoFocus
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───
export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<"documents" | "notes">("notes");
  const [docs, setDocs] = useState<Document[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const togglePin = async (doc: Document) => {
    if (doc.source !== "note") return;
    await fetch(`/api/notes/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !doc.pinned }),
    });
    fetchDocs();
  };

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedRole) params.set("roleId", selectedRole);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    try {
      const res = await fetch(`/api/documents?${params}`);
      const data = await res.json();
      if (Array.isArray(data)) setDocs(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedRole, searchQuery]);

  useEffect(() => {
    fetch("/api/roles").then((r) => r.json()).then(setRoles).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "documents") {
      const timer = setTimeout(fetchDocs, searchQuery ? 300 : 0);
      return () => clearTimeout(timer);
    }
  }, [fetchDocs, searchQuery, activeTab]);

  return (
    <AppShell>
      <div className="py-4">
        {/* Header with tab toggle */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-[28px] font-semibold text-[var(--text-primary)] mb-1">
              {activeTab === "notes" ? "Notes" : "Documents"}
            </h1>
            <p className="text-[15px] text-[var(--text-tertiary)]">
              {activeTab === "notes"
                ? "Quick notes organized by role. Pinned notes are included in AI context."
                : "Uploaded files, notes, and extracted content."}
            </p>
          </div>
          <div className="flex bg-[var(--surface-sunken)] rounded-xl p-1 gap-0.5">
            <button
              onClick={() => setActiveTab("notes")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
                activeTab === "notes"
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              <StickyNote className="h-3.5 w-3.5" /> Notes
            </button>
            <button
              onClick={() => setActiveTab("documents")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
                activeTab === "documents"
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              <FolderOpen className="h-3.5 w-3.5" /> Documents
            </button>
          </div>
        </div>

        {/* Notes tab */}
        {activeTab === "notes" && <NotesPanel roles={roles} />}

        {/* Documents tab (existing UI) */}
        {activeTab === "documents" && (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative w-full sm:flex-1 sm:max-w-[400px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                <button
                  onClick={() => setSelectedRole("")}
                  className={cn(
                    "px-3 py-2 rounded-xl text-[13px] font-medium border shrink-0 transition-colors",
                    !selectedRole
                      ? "bg-[var(--accent-blue)] text-white border-transparent"
                      : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  )}
                >
                  All
                </button>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRole(selectedRole === r.id ? "" : r.id)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-[13px] font-medium border shrink-0 transition-colors flex items-center gap-1.5",
                      selectedRole === r.id
                        ? "border-transparent text-white"
                        : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    )}
                    style={selectedRole === r.id ? { backgroundColor: r.color } : undefined}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                    {r.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Document List */}
            {loading ? (
              <div className="text-center py-12 text-[var(--text-tertiary)]">Loading...</div>
            ) : docs.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-4" />
                <p className="text-[16px] text-[var(--text-secondary)] mb-1">No documents yet</p>
                <p className="text-[14px] text-[var(--text-tertiary)]">
                  {searchQuery
                    ? "No documents match your search."
                    : "Upload files in the AI chat or Inbox to see them here."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => {
                  const isExpanded = expandedId === doc.id;
                  const icon = FILE_TYPE_ICONS[doc.fileType] || "\u{1F4CE}";

                  return (
                    <div
                      key={doc.id}
                      className={cn(
                        "border rounded-xl bg-[var(--surface-raised)] overflow-hidden",
                        doc.pinned ? "border-[var(--accent-blue)]/30" : "border-[var(--border-subtle)]"
                      )}
                    >
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[var(--sidebar-hover)] transition-colors"
                      >
                        <span className="text-[20px] shrink-0">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-medium text-[var(--text-primary)] truncate">
                            {doc.pinned && <Pin className="inline h-3.5 w-3.5 text-[var(--accent-blue)] mr-1.5 -mt-0.5" />}
                            {doc.filename}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[13px] text-[var(--text-tertiary)] flex-wrap">
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold"
                              style={{ backgroundColor: `${doc.roleColor}1a`, color: doc.roleColor }}
                            >
                              {doc.roleName}
                            </span>
                            <span>{formatDate(doc.createdAt)}</span>
                            <span>&middot;</span>
                            <span>{formatSize(doc.contentLength)}</span>
                            <span>&middot;</span>
                            <span className="uppercase text-[11px]">{doc.fileType}</span>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-5 pb-4 pt-0 border-t border-[var(--border-subtle)]">
                          {doc.summary && (
                            <div className="mt-3 rounded-lg bg-[var(--accent-blue)]/5 border border-[var(--accent-blue)]/10 p-3">
                              <p className="text-[11px] uppercase tracking-wider text-[var(--accent-blue)] font-medium mb-1">AI Summary</p>
                              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{doc.summary}</p>
                            </div>
                          )}
                          <pre className="text-[13px] text-[var(--text-secondary)] bg-[var(--surface-sunken)] rounded-lg p-4 mt-3 whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto">
                            {doc.preview || "(no text content)"}
                          </pre>
                          <div className="flex gap-2 mt-3">
                            <a
                              href={doc.fileUploadId
                                ? `/api/documents/download?fileId=${doc.fileUploadId}`
                                : `/api/documents/download?noteId=${doc.id}`}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent-blue)] text-white text-[13px] font-medium hover:opacity-90"
                            >
                              <Download className="h-3.5 w-3.5" /> Download
                            </a>
                            <Link
                              href={`/ai?roleId=${doc.roleId}&docId=${doc.id}`}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] text-[13px] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]"
                            >
                              <Sparkles className="h-3.5 w-3.5" /> Open in AI
                            </Link>
                            {doc.source === "note" && (
                              <button
                                onClick={() => togglePin(doc)}
                                className={cn(
                                  "flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[13px] transition-colors",
                                  doc.pinned
                                    ? "border-[var(--accent-blue)]/30 text-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
                                    : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                                )}
                              >
                                {doc.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                                {doc.pinned ? "Unpin" : "Pin to AI context"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
