"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, MoreVertical, Plus, PenLine, ListChecks, CalendarClock, Sparkles, Mic, Calendar, Send, AlertCircle, Target, Users, RefreshCw, XCircle, Zap, Copy, Maximize2, Minimize2, X, CheckSquare, FileOutput, Loader2, Trash2, Download, FileText, Paperclip, Image } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface Skill {
  id: string;
  name: string;
  label: string;
  description: string;
  icon?: string;
  category: string;
}

interface ConductorContext {
  roles: Array<{ id: string; name: string; color: string; title: string }>;
  todayTasks: Array<{ id: string; title: string; status: string; roleId: string; tags: string[] }>;
  followUps: Array<{ id: string; title: string; waitingOn: string; roleId: string; daysSince: number }>;
  currentBlock: { roleId: string; label: string; timeLabel: string } | null;
  date: string;
}

interface ChatThreadProps {
  roleId: string;
  roleName: string;
  roleColor?: string;
  roleTitle?: string;
  messages: Message[];
  onSendMessage: (message: string, attachments?: Array<{ filename: string; text?: string; base64?: string; mimeType?: string }>) => Promise<void>;
  onClearConversation: () => void;
  loading?: boolean;
  conductorData?: ConductorContext;
  threadName?: string;
  fontSize?: number;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const SKILL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Mic, Calendar, Send, AlertCircle, Target, Users, RefreshCw, XCircle, Zap,
  PenLine, ListChecks, CalendarClock, Sparkles,
};

function SkillIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = name ? SKILL_ICONS[name] : null;
  return Icon ? <Icon className={className} /> : <Zap className={className} />;
}

// --- Artifact parsing and rendering ---

interface ArtifactPart {
  type: "artifact";
  title: string;
  artifactType: string;
  code: string;
}

interface FilePart {
  type: "file";
  filename: string;
  content: string;
}

interface TextPart {
  type: "text";
  text: string;
}

type MessagePart = TextPart | ArtifactPart | FilePart;

function parseArtifacts(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  // Match :::artifact{...} and :::file{...} delimiters
  const regex = /:::(artifact|file)\{(?:title="([^"]+)"\s+type="([^"]+)"|name="([^"]+)")\}\n([\s\S]*?)\n:::/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    if (match[1] === "file") {
      parts.push({
        type: "file",
        filename: match[4],
        content: match[5],
      });
    } else {
      parts.push({
        type: "artifact",
        title: match[2],
        artifactType: match[3],
        code: match[5],
      });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    parts.push({ type: "text", text: remaining });
  }

  // If no artifacts were found, check if the entire response looks like raw HTML
  // (starts with <!DOCTYPE, <html, or contains substantial HTML structure)
  if (parts.length === 1 && parts[0].type === "text") {
    const text = parts[0].text.trim();
    const htmlMatch = text.match(/^([\s\S]*?)(<!DOCTYPE[\s\S]*|<html[\s\S]*)/i);
    if (htmlMatch) {
      const before = htmlMatch[1].trim();
      const htmlCode = htmlMatch[2];
      const result: MessagePart[] = [];
      if (before) result.push({ type: "text", text: before });
      result.push({ type: "artifact", title: "HTML Output", artifactType: "html", code: htmlCode });
      return result;
    }
    // Also detect HTML that starts with <style> or <head> or a block of tags
    if (/^<(style|head|div|section|main)\b/i.test(text) || (text.split('<').length > 10 && text.split('>').length > 10)) {
      return [{ type: "artifact", title: "HTML Output", artifactType: "html", code: text }];
    }
  }

  return parts;
}

function buildRawHTML(code: string, data?: ConductorContext): string {
  return `<!DOCTYPE html>
<html><head>
<style>body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, sans-serif; background: #2f2f2a; color: #ececec; } * { box-sizing: border-box; }</style>
<script>window.CONDUCTOR_DATA = ${JSON.stringify(data || {})};</script>
</head><body>${code}</body></html>`;
}

function buildMermaidHTML(code: string): string {
  return `<!DOCTYPE html>
<html><head>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>body { margin: 0; padding: 16px; background: #2f2f2a; color: #ececec; }</style>
</head><body>
<pre class="mermaid">${code}</pre>
<script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
</body></html>`;
}

function buildReactHTML(code: string, data?: ConductorContext): string {
  return `<!DOCTYPE html>
<html><head>
<script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/recharts@2/umd/Recharts.js"></script>
<style>body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, sans-serif; background: #2f2f2a; color: #ececec; } * { box-sizing: border-box; }</style>
<script>window.CONDUCTOR_DATA = ${JSON.stringify(data || {})};</script>
</head><body>
<div id="root"></div>
<script type="text/babel">
${code}
</script>
</body></html>`;
}

function ArtifactDrawer({ title, htmlContent, onClose, onCopy }: { title: string; htmlContent: string; onClose: () => void; onCopy: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer panel — slides in from right */}
      <div className="relative ml-auto w-full max-w-[75vw] h-full bg-[var(--surface)] border-l border-[var(--border-subtle)] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] shrink-0">
          <span className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{title}</span>
          <div className="flex items-center gap-2">
            <button onClick={onCopy} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--sidebar-hover)]">
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Full-height iframe */}
        <iframe
          srcDoc={htmlContent}
          sandbox="allow-scripts allow-same-origin"
          className="flex-1 w-full border-0"
        />
      </div>
    </div>
  );
}

function ArtifactBlock({ title, type, code, conductorData }: { title: string; type: string; code: string; conductorData?: ConductorContext }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const htmlContent = type === "mermaid"
    ? buildMermaidHTML(code)
    : type === "react"
    ? buildReactHTML(code, conductorData)
    : buildRawHTML(code, conductorData);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
  };

  return (
    <>
      {/* Inline preview card */}
      <div className="my-3 border border-[var(--border-subtle)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface-sunken,var(--surface-raised))] border-b border-[var(--border-subtle)]">
          <span className="text-[14px] font-medium text-[var(--text-primary)]">{title}</span>
          <div className="flex gap-2">
            <button onClick={copyCode} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
              <Copy className="h-3 w-3" /> Copy
            </button>
            <button onClick={() => setDrawerOpen(true)} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
              <Maximize2 className="h-3 w-3" /> Open
            </button>
          </div>
        </div>
        {/* Clickable preview */}
        <div className="relative cursor-pointer group" onClick={() => setDrawerOpen(true)}>
          <iframe
            srcDoc={htmlContent}
            sandbox="allow-scripts allow-same-origin"
            className="w-full border-0 pointer-events-none"
            style={{ height: 350 }}
          />
          {/* Fade overlay to indicate there's more */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--surface)] to-transparent flex items-end justify-center pb-2">
            <span className="text-[12px] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
              <Maximize2 className="h-3 w-3" /> Click to expand
            </span>
          </div>
        </div>
      </div>

      {/* Full-screen drawer */}
      {drawerOpen && (
        <ArtifactDrawer
          title={title}
          htmlContent={htmlContent}
          onClose={() => setDrawerOpen(false)}
          onCopy={copyCode}
        />
      )}
    </>
  );
}

function triggerDownload(content: string, filename: string) {
  const mimeTypes: Record<string, string> = {
    csv: "text/csv", json: "application/json", txt: "text/plain",
    html: "text/html", xml: "application/xml", md: "text/markdown",
    sql: "text/x-sql", py: "text/x-python", js: "text/javascript",
    ts: "text/typescript", sh: "text/x-sh", yaml: "text/yaml",
    yml: "text/yaml", toml: "text/toml", ini: "text/plain",
    svg: "image/svg+xml",
  };
  const ext = filename.split(".").pop()?.toLowerCase() || "txt";
  const mime = mimeTypes[ext] || "text/plain";
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function FileBlock({ filename, content }: { filename: string; content: string }) {
  const ext = filename.split(".").pop()?.toUpperCase() || "FILE";
  const lines = content.split("\n").length;
  const size = new Blob([content]).size;
  const sizeLabel = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;

  return (
    <div className="my-3 border border-[var(--border-subtle)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--surface-sunken,var(--surface-raised))]">
        <div className="w-10 h-10 rounded-lg bg-[var(--accent-blue)]/15 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-[var(--accent-blue)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-[var(--text-primary)] truncate">{filename}</div>
          <div className="text-[12px] text-[var(--text-tertiary)]">{ext} &middot; {lines} lines &middot; {sizeLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { navigator.clipboard.writeText(content); }}
            className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)]"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
          <button
            onClick={() => triggerDownload(content, filename)}
            className="text-[12px] text-white bg-[var(--accent-blue)] hover:opacity-90 transition-opacity flex items-center gap-1 px-3 py-1.5 rounded-md font-medium"
          >
            <Download className="h-3 w-3" /> Download
          </button>
        </div>
      </div>
      {/* Preview first few lines */}
      <pre className="font-mono text-[11px] text-[var(--text-secondary)] bg-white/[0.03] px-4 py-2 max-h-[120px] overflow-hidden whitespace-pre-wrap border-t border-[var(--border-subtle)]">
        {content.split("\n").slice(0, 6).join("\n")}{lines > 6 ? "\n…" : ""}
      </pre>
    </div>
  );
}

function renderMessageContent(content: string) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-[18px] font-bold mt-3 mb-1 text-[var(--text-primary)]">{children}</h1>,
        h2: ({ children }) => <h2 className="text-[16px] font-semibold mt-2.5 mb-1 text-[var(--text-primary)]">{children}</h2>,
        h3: ({ children }) => <h3 className="text-[15px] font-semibold mt-2 mb-0.5 text-[var(--text-primary)]">{children}</h3>,
        p: ({ children }) => <p className="mb-1 last:mb-0 leading-snug">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-1.5">{children}</ol>,
        li: ({ children }) => <li className="text-[var(--text-primary)] leading-snug [&>p]:mb-0">{children}</li>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-blue)] underline hover:opacity-80">{children}</a>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--border-default)] pl-3 my-2 text-[var(--text-secondary)] italic">{children}</blockquote>,
        hr: () => <hr className="border-[var(--border-subtle)] my-3" />,
        table: ({ children }) => <div className="overflow-x-auto my-2"><table className="min-w-full text-[14px] border-collapse">{children}</table></div>,
        thead: ({ children }) => <thead className="border-b border-[var(--border-default)]">{children}</thead>,
        th: ({ children }) => <th className="text-left px-3 py-1.5 font-semibold text-[var(--text-secondary)]">{children}</th>,
        td: ({ children }) => <td className="px-3 py-1.5 border-t border-[var(--border-subtle)]">{children}</td>,
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            const lang = className?.replace("language-", "") || "";
            const text = String(children).replace(/\n$/, "");
            const extMap: Record<string, string> = {
              csv: "csv", json: "json", sql: "sql", python: "py", py: "py",
              javascript: "js", js: "js", typescript: "ts", ts: "ts",
              html: "html", xml: "xml", yaml: "yaml", yml: "yml",
              bash: "sh", sh: "sh", markdown: "md", md: "md", svg: "svg",
              css: "css", toml: "toml", ini: "ini", txt: "txt",
            };
            const ext = extMap[lang] || lang || "txt";
            return (
              <div className="relative group my-2">
                <pre className="font-mono text-[12px] bg-white/5 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap">
                  <code>{children}</code>
                </pre>
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => navigator.clipboard.writeText(text)}
                    className="p-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
                    title="Copy"
                  >
                    <Copy className="h-3 w-3 text-[var(--text-tertiary)]" />
                  </button>
                  <button
                    onClick={() => triggerDownload(text, `output.${ext}`)}
                    className="p-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
                    title={`Download as .${ext}`}
                  >
                    <Download className="h-3 w-3 text-[var(--text-tertiary)]" />
                  </button>
                </div>
              </div>
            );
          }
          return (
            <code className="font-mono text-[12px] bg-white/5 rounded px-1 py-0.5">{children}</code>
          );
        },
        pre: ({ children }) => <>{children}</>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ChatThread({ roleId, roleName, roleColor = "#4d8ef7", roleTitle, messages, onSendMessage, onClearConversation, loading, conductorData, threadName, fontSize = 15 }: ChatThreadProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [skillFilter, setSkillFilter] = useState("");
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const skillMenuRef = useRef<HTMLDivElement>(null);
  const [extractingIdx, setExtractingIdx] = useState<number | null>(null);
  const [savingDraftIdx, setSavingDraftIdx] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<Record<number, string>>({});
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ filename: string; text?: string; base64?: string; mimeType?: string }>>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  const extractTasksFromMessage = async (msgIdx: number, content: string) => {
    setExtractingIdx(msgIdx);
    try {
      const res = await fetch("/api/ai/extract-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, roleId }),
      });
      const data = await res.json();
      const tasks = data.tasks || [];
      const followUps = data.followUps || [];
      let created = 0;
      for (const t of tasks) {
        await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId, title: t.title, priority: t.priority || "normal", status: "backlog" }) });
        created++;
      }
      for (const f of followUps) {
        await fetch("/api/followups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId, title: f.title, waitingOn: f.waitingOn || "" }) });
        created++;
      }
      setActionFeedback((prev) => ({ ...prev, [msgIdx]: `Created ${tasks.length} task${tasks.length !== 1 ? "s" : ""}, ${followUps.length} follow-up${followUps.length !== 1 ? "s" : ""}` }));
      setTimeout(() => setActionFeedback((prev) => { const next = { ...prev }; delete next[msgIdx]; return next; }), 4000);
    } catch {}
    setExtractingIdx(null);
  };

  const saveToDrafts = async (msgIdx: number, content: string) => {
    setSavingDraftIdx(msgIdx);
    try {
      await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, content, platform: "" }),
      });
      setActionFeedback((prev) => ({ ...prev, [msgIdx]: "Saved to drafts" }));
      setTimeout(() => setActionFeedback((prev) => { const next = { ...prev }; delete next[msgIdx]; return next; }), 3000);
    } catch {}
    setSavingDraftIdx(null);
  };

  // Load skills once
  useEffect(() => {
    fetch("/api/skills").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setSkills(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const filteredSkills = skills.filter((s) =>
    s.name.includes(skillFilter) || s.label.toLowerCase().includes(skillFilter) || s.description.toLowerCase().includes(skillFilter)
  );

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.startsWith("/")) {
      setShowSkillMenu(true);
      setSkillFilter(value.slice(1).toLowerCase());
      setSelectedSkillIndex(0);
    } else {
      setShowSkillMenu(false);
    }
  };

  const executeSkill = async (skill: Skill) => {
    setShowSkillMenu(false);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/skills/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: skill.id, roleId }),
      });
      const data = await res.json();
      if (data.prompt) {
        await onSendMessage(data.prompt);
      }
    } catch {}
    setSending(false);
  };

  const handleSend = async () => {
    const hasAttachments = pendingAttachments.length > 0;
    if ((!input.trim() && !hasAttachments) || sending) return;
    const msg = input.trim() || (hasAttachments ? `[Uploaded: ${pendingAttachments.map(a => a.filename).join(", ")}]` : "");
    const attachments = hasAttachments ? [...pendingAttachments] : undefined;
    setInput("");
    setPendingAttachments([]);
    setShowSkillMenu(false);
    setSending(true);
    try {
      await onSendMessage(msg, attachments);
    } catch {}
    setSending(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/conversations/${roleId}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.text || data.base64) {
        setPendingAttachments(prev => [...prev, { filename: file.name, text: data.text, base64: data.base64, mimeType: data.mimeType }]);
      }
    } catch {}
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const quickPrompts = [
    { label: "Draft a message", icon: PenLine },
    { label: "What's next?", icon: ListChecks },
    { label: "What's stale?", icon: CalendarClock },
    { label: "Summarize my day", icon: Sparkles },
  ];

  const isEmpty = messages.length === 0 && !sending && !loading;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSkillMenu && filteredSkills.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSkillIndex((i) => Math.min(i + 1, filteredSkills.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSkillIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        executeSkill(filteredSkills[selectedSkillIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSkillMenu(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputArea = (
    <div className="w-full relative">
      {/* Slash command menu */}
      {showSkillMenu && filteredSkills.length > 0 && (
        <div ref={skillMenuRef} className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl overflow-hidden max-h-[300px] overflow-y-auto z-50">
          {filteredSkills.map((skill, i) => (
            <button
              key={skill.id}
              onClick={() => executeSkill(skill)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                i === selectedSkillIndex ? "bg-[var(--sidebar-hover)]" : "hover:bg-[var(--sidebar-hover)]"
              }`}
            >
              <SkillIcon name={skill.icon} className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
              <div className="min-w-0">
                <span className="text-[15px] font-medium text-[var(--text-primary)]">/{skill.name}</span>
                <span className="text-[13px] text-[var(--text-tertiary)] ml-2">{skill.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
        {/* Pending attachment chips */}
        {(pendingAttachments.length > 0 || uploadingFile) && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {pendingAttachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/20 text-[13px] text-[var(--text-secondary)]">
                {att.mimeType?.startsWith("image/") ? <Image className="h-3.5 w-3.5 text-[var(--accent-blue)] shrink-0" /> : <Paperclip className="h-3.5 w-3.5 text-[var(--accent-blue)] shrink-0" />}
                <span className="max-w-[160px] truncate">{att.filename}</span>
                <button onClick={() => removeAttachment(i)} className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center transition-colors">
                  <X className="h-3 w-3 text-[var(--text-tertiary)]" />
                </button>
              </div>
            ))}
            {uploadingFile && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 text-[13px] text-[var(--text-tertiary)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Uploading…
              </div>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pendingAttachments.length > 0 ? "Add a message or press send…" : "How can I help you today? Type / for commands"}
          rows={1}
          className="w-full bg-transparent px-5 pt-4 pb-2 text-[16px] text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-tertiary)]"
        />
        <div className="flex items-center justify-between px-3 pb-3">
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.docx,.doc,.txt,.md,.csv" onChange={handleFileUpload} />
          <button
            className="w-9 h-9 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClearConversation}
              className="w-9 h-9 rounded-lg hover:bg-red-500/10 flex items-center justify-center transition-colors group"
              title="Clear conversation"
            >
              <Trash2 className="h-3.5 w-3.5 text-[var(--text-tertiary)] group-hover:text-red-400" />
            </button>
            <button
              onClick={handleSend}
              disabled={(!input.trim() && pendingAttachments.length === 0) || sending}
              className="w-9 h-9 rounded-lg bg-[var(--accent-blue)] text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30"
            >
              <ArrowUp className="h-[16px] w-[16px]" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Empty state — Claude-style centered layout
  if (isEmpty) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center">
        <div className="flex flex-col items-center w-full max-w-[640px] px-4 mt-12">
          {/* Greeting */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />
            <h1 className="text-[32px] font-semibold text-[var(--text-primary)] tracking-tight">
              {getGreeting()}
            </h1>
          </div>

          {/* Centered input */}
          {inputArea}

          {/* Quick action chips */}
          <div className="flex flex-wrap gap-2 justify-center mt-5">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt.label}
                onClick={() => setInput(prompt.label)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"

              >
                <prompt.icon className="h-3.5 w-3.5 opacity-60" />
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Active conversation layout
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Thread name header */}
      {threadName && (
        <div className="shrink-0 px-2 py-1.5 border-b border-[var(--border-subtle)]">
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">{threadName}</span>
        </div>
      )}
      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 hide-scrollbar space-y-5">
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex flex-col items-end gap-1">
              <div className="bg-[var(--surface-raised)] text-[var(--text-primary)] px-4 py-3 rounded-2xl rounded-br-sm max-w-[85%] leading-snug" style={{ fontSize: `${fontSize}px` }}>
                {renderMessageContent(msg.content)}
              </div>
              {msg.timestamp && <span className="text-[13px] text-[var(--text-tertiary)] px-1">{msg.timestamp}</span>}
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start gap-1">
              <div className="max-w-[85%]" data-msg-idx={i}>
                {parseArtifacts(msg.content).map((part, j) =>
                  part.type === "text" ? (
                    <div key={j} className="text-[var(--text-primary)] leading-snug" style={{ fontSize: `${fontSize}px` }}>
                      {renderMessageContent(part.text)}
                    </div>
                  ) : part.type === "file" ? (
                    <FileBlock key={j} filename={part.filename} content={part.content} />
                  ) : (
                    <ArtifactBlock
                      key={j}
                      title={part.title}
                      type={part.artifactType}
                      code={part.code}
                      conductorData={conductorData}
                    />
                  )
                )}
              </div>
              {/* Action buttons for assistant messages */}
              <div className="flex items-center gap-1.5 mt-1.5 ml-0.5">
                <button
                  onClick={async () => {
                    try {
                      // Grab rendered HTML from the message DOM
                      const el = document.querySelector(`[data-msg-idx="${i}"]`);
                      const html = el?.innerHTML || msg.content;
                      await navigator.clipboard.write([
                        new ClipboardItem({
                          "text/html": new Blob([html], { type: "text/html" }),
                          "text/plain": new Blob([msg.content], { type: "text/plain" }),
                        }),
                      ]);
                    } catch {
                      // Fallback for older browsers
                      await navigator.clipboard.writeText(msg.content);
                    }
                    setActionFeedback((prev) => ({ ...prev, [i]: "Copied!" }));
                    setTimeout(() => setActionFeedback((prev) => { const next = { ...prev }; delete next[i]; return next; }), 2000);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
                <button
                  onClick={() => extractTasksFromMessage(i, msg.content)}
                  disabled={extractingIdx === i}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors disabled:opacity-50"
                >
                  {extractingIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckSquare className="h-3 w-3" />}
                  Create tasks
                </button>
                <button
                  onClick={() => saveToDrafts(i, msg.content)}
                  disabled={savingDraftIdx === i}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors disabled:opacity-50"
                >
                  {savingDraftIdx === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileOutput className="h-3 w-3" />}
                  Save to drafts
                </button>
                {actionFeedback[i] && (
                  <span className="text-[11px] text-green-400 ml-1">{actionFeedback[i]}</span>
                )}
              </div>
              {msg.timestamp && <span className="text-[13px] text-[var(--text-tertiary)] px-1">{msg.timestamp}</span>}
            </div>
          )
        )}

        {/* Loading indicator */}
        {(sending || loading) && (
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-1 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom input — fixed to bottom */}
      <div className="shrink-0 px-4 pt-2 pb-4">
        {inputArea}
      </div>
    </div>
  );
}
