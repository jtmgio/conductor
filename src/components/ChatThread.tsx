"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, MoreVertical, Plus, PenLine, ListChecks, CalendarClock, Sparkles } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
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
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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
export function ChatThread({ roleId, roleName, roleColor = "#4d8ef7", roleTitle, messages, onSendMessage, onClearConversation, loading }: ChatThreadProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const msg = input;
    setInput("");
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

  const inputArea = (
    <div className="w-full">
      <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="How can I help you today?"
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
              <div className="max-w-[85%] text-[var(--text-primary)] text-[16px] leading-relaxed whitespace-pre-wrap">
                {renderMessageContent(msg.content)}
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
