"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { Search, FileText, Sparkles, ChevronDown, ChevronUp, Download, Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

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

interface Role {
  id: string;
  name: string;
  color: string;
}

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

const FILE_TYPE_ICONS: Record<string, string> = {
  docx: "📄",
  doc: "📄",
  pdf: "📕",
  txt: "📝",
  md: "📝",
  csv: "📊",
  json: "📋",
  png: "🖼",
  jpg: "🖼",
  jpeg: "🖼",
};

export function DocumentsPage() {
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
    const timer = setTimeout(fetchDocs, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchDocs, searchQuery]);

  return (
    <AppShell>
      <div className="py-4">
        <h1 className="text-[28px] font-semibold text-[var(--text-primary)] mb-6">Documents</h1>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-[400px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-blue)]"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
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
              const icon = FILE_TYPE_ICONS[doc.fileType] || "📎";

              return (
                <div
                  key={doc.id}
                  className={cn(
                    "border rounded-xl bg-[var(--surface-raised)] overflow-hidden",
                    doc.pinned ? "border-[var(--accent-blue)]/30" : "border-[var(--border-subtle)]"
                  )}
                >
                  {/* Header row */}
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
                      <div className="flex items-center gap-2 mt-0.5 text-[13px] text-[var(--text-tertiary)]">
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

                  {/* Expanded content */}
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
      </div>
    </AppShell>
  );
}
