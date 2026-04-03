"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, MoreVertical, Plus, PenLine, ListChecks, CalendarClock, Sparkles, Mic, Calendar, Send, AlertCircle, Target, Users, RefreshCw, XCircle, Zap, Copy, Maximize2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

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

interface TextPart {
  type: "text";
  text: string;
}

type MessagePart = TextPart | ArtifactPart;

function parseArtifacts(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const regex = /:::artifact\{title="([^"]+)"\s+type="([^"]+)"\}\n([\s\S]*?)\n:::/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: "artifact",
      title: match[1],
      artifactType: match[2],
      code: match[3],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
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

function ArtifactBlock({ title, type, code, conductorData }: { title: string; type: string; code: string; conductorData?: ConductorContext }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [expanded, setExpanded] = useState(false);

  const htmlContent = type === "mermaid"
    ? buildMermaidHTML(code)
    : type === "react"
    ? buildReactHTML(code, conductorData)
    : buildRawHTML(code, conductorData);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
  };

  const resizeToContent = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const body = iframe.contentDocument?.body;
      if (body) {
        const height = Math.min(Math.max(body.scrollHeight + 32, 200), expanded ? 2000 : 600);
        iframe.style.height = height + "px";
      }
    } catch {
      // cross-origin, use default height
    }
  };

  return (
    <div className="my-3 border border-[var(--border-subtle)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface-sunken,var(--surface-raised))] border-b border-[var(--border-subtle)]">
        <span className="text-[14px] font-medium text-[var(--text-primary)]">{title}</span>
        <div className="flex gap-2">
          <button onClick={copyCode} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
            <Copy className="h-3 w-3" /> Copy
          </button>
          <button onClick={() => setExpanded(!expanded)} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-1">
            <Maximize2 className="h-3 w-3" /> {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        sandbox="allow-scripts"
        className="w-full border-0"
        style={{ minHeight: 200, maxHeight: expanded ? 2000 : 600 }}
        onLoad={resizeToContent}
      />
    </div>
  );
}

function renderMessageContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const code = part.slice(3, -3).replace(/^\w*\n/, "");
      return (
        <pre key={i} className="font-mono text-[12px] bg-white/5 rounded-lg px-3 py-2 my-2 overflow-x-auto whitespace-pre-wrap">
          <code>{code}</code>
        </pre>
      );
    }
    const inlineParts = part.split(/(`[^`]+`)/g);
    return (
      <span key={i}>
        {inlineParts.map((ip, j) => {
          if (ip.startsWith("`") && ip.endsWith("`")) {
            return (
              <code key={j} className="font-mono text-[12px] bg-white/5 rounded px-1 py-0.5">
                {ip.slice(1, -1)}
              </code>
            );
          }
          return <span key={j}>{ip}</span>;
        })}
      </span>
    );
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ChatThread({ roleId, roleName, roleColor = "#4d8ef7", roleTitle, messages, onSendMessage, onClearConversation, loading, conductorData }: ChatThreadProps) {
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
    if (!input.trim() || sending) return;
    const msg = input;
    setInput("");
    setShowSkillMenu(false);
    setSending(true);
    try {
      await onSendMessage(msg);
    } catch {}
    setSending(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/conversations/${roleId}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (data.text || data.base64) {
        await onSendMessage(`[Uploaded: ${file.name}]`, [{ filename: file.name, text: data.text, base64: data.base64, mimeType: data.mimeType }]);
      }
    } catch {}
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="How can I help you today? Type / for commands"
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-9 h-9 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center justify-center transition-colors">
                  <MoreVertical className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onClearConversation} className="text-red-400">Clear conversation</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
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
        <div className="flex flex-col items-center w-full max-w-[640px] px-4 -mt-12">
          {/* Greeting */}
          <div className="flex items-center gap-3 mb-10">
            <span className="text-3xl" style={{ color: roleColor }}>*</span>
            <h1 className="text-[32px] font-semibold text-[var(--text-primary)] tracking-tight">
              {getGreeting()}, JG
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
      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-4 hide-scrollbar space-y-5">
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex flex-col items-end gap-1">
              <div className="bg-[var(--surface-raised)] text-[var(--text-primary)] px-4 py-3 rounded-2xl rounded-br-sm max-w-[85%] text-[16px] leading-relaxed whitespace-pre-wrap">
                {renderMessageContent(msg.content)}
              </div>
              {msg.timestamp && <span className="text-[13px] text-[var(--text-tertiary)] px-1">{msg.timestamp}</span>}
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start gap-1">
              <div className="max-w-[85%]">
                {parseArtifacts(msg.content).map((part, j) =>
                  part.type === "text" ? (
                    <div key={j} className="text-[var(--text-primary)] text-[16px] leading-relaxed whitespace-pre-wrap">
                      {renderMessageContent(part.text)}
                    </div>
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

      {/* Bottom input */}
      <div className="shrink-0 py-3">
        {inputArea}
      </div>
    </div>
  );
}
