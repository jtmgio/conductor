"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, ArrowUp, MoreVertical } from "lucide-react";
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

  const quickPrompts = ["What's next?", "Draft a message", "What's stale?"];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-4 hide-scrollbar space-y-5">
        {/* Empty state */}
        {messages.length === 0 && !sending && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Camera className="h-10 w-10 text-[var(--text-tertiary)]" />
            <div className="text-center">
              <p className="text-base font-medium text-[var(--text-secondary)]">Upload a calendar screenshot</p>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-1">I&apos;ll reconfigure your blocks around meetings</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setInput(prompt)}
                  className="px-3.5 py-1.5 rounded-full text-[14px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex flex-col items-end gap-1">
              <div className="bg-[var(--surface-raised)] text-[var(--text-primary)] px-4 py-3 rounded-2xl rounded-br-sm max-w-[85%] text-[15px] leading-relaxed whitespace-pre-wrap">
                {renderMessageContent(msg.content)}
              </div>
              {msg.timestamp && <span className="text-[13px] text-[var(--text-tertiary)] px-1">{msg.timestamp}</span>}
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start gap-1">
              <div className="max-w-[85%] text-[var(--text-primary)] text-[15px] leading-relaxed whitespace-pre-wrap">
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

      {/* Input area */}
      <div className="shrink-0 py-3">
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.docx,.doc,.txt,.md,.csv" onChange={handleFileUpload} />
          <button
            className="w-10 h-10 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors flex-shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="h-[18px] w-[18px]" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask about your day..."
            rows={1}
            className="flex-1 bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-[15px] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 resize-none placeholder:text-[var(--text-tertiary)]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-xl bg-[var(--accent-blue)] text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 flex-shrink-0"
          >
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex justify-end mt-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-11 h-11 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center justify-center transition-colors">
                <MoreVertical className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onClearConversation} className="text-red-400">Clear conversation</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
