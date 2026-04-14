"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ChatThread } from "@/components/ChatThread";
import { DraftVariants } from "@/components/DraftVariants";
import { ThreadSidebar, type Thread } from "@/components/ThreadSidebar";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Key, FileText, MessageSquare } from "lucide-react";
import { useHotkeys, type Shortcut } from "@/hooks/useHotkeys";
import { useFontSize } from "@/hooks/useFontSize";
import { FontSizeControl } from "@/components/FontSizeControl";
import Link from "next/link";

interface Role { id: string; name: string; title: string; color: string; }
interface Message { role: "user" | "assistant"; content: string; timestamp?: string; }
interface DraftVariant { label: string; text: string; }
interface ConductorContext {
  roles: Array<{ id: string; name: string; color: string; title: string }>;
  todayTasks: Array<{ id: string; title: string; status: string; roleId: string; tags: string[] }>;
  followUps: Array<{ id: string; title: string; waitingOn: string; roleId: string; daysSince: number }>;
  currentBlock: { roleId: string; label: string; timeLabel: string } | null;
  date: string;
}

const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "anthropic" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "anthropic" },
  { id: "claude-opus-4-6", label: "Opus 4.6", provider: "anthropic" },
];

const OPENAI_MODELS = [
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", provider: "openai" },
  { id: "gpt-5.4-pro", label: "GPT-5.4 Pro", provider: "openai" },
];

export function AIPage() {
  const searchParams = useSearchParams();
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRoleId, setActiveRoleId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftVariants, setDraftVariants] = useState<DraftVariant[] | null>(null);
  const [selectedModel, setSelectedModel] = useState(ANTHROPIC_MODELS[0].id);
  const [conductorData, setConductorData] = useState<ConductorContext | undefined>();
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [loadedDocName, setLoadedDocName] = useState<string | null>(null);
  const docHandledRef = React.useRef(false);
  const { toast } = useToast();

  const font = useFontSize("ai-chat");

  // Thread state
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [threadSidebarCollapsed, setThreadSidebarCollapsed] = useState(true);

  useEffect(() => {
    fetch("/api/roles").then((r) => r.json()).then((data) => {
      const arr = Array.isArray(data) ? data : [];
      setRoles(arr);
      setActiveRoleId(searchParams.get("roleId") || arr[0]?.id || "");
    }).catch(() => {});
    fetch("/api/context").then((r) => r.json()).then(setConductorData).catch(() => {});
    fetch("/api/profile").then((r) => r.json()).then((p) => {
      setHasApiKey(p.hasAnthropicKey);
      setHasOpenAIKey(!!p.hasOpenAIKey);
    }).catch(() => {});
  }, [searchParams]);

  const loadThreads = useCallback(async (roleId: string) => {
    try {
      const res = await fetch(`/api/conversations/${roleId}`);
      if (!res.ok) return;
      const data = await res.json();
      const threadList: Thread[] = data.threads || [];
      setThreads(threadList);

      // Auto-expand sidebar if more than 1 thread
      if (threadList.length > 1) setThreadSidebarCollapsed(false);
      else setThreadSidebarCollapsed(true);

      // Select default thread or first
      const defaultId = data.defaultThreadId || threadList[0]?.id || "";
      setActiveThreadId(defaultId);
      return defaultId;
    } catch {
      return "";
    }
  }, []);

  const loadThreadMessages = useCallback(async (roleId: string, threadId: string) => {
    if (!threadId) { setMessages([]); return; }
    try {
      const res = await fetch(`/api/conversations/${roleId}/threads/${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch {}
  }, []);

  const handleDraft = useCallback(async (topic: string, recipient?: string) => {
    setLoading(true);
    try { const res = await fetch("/api/ai/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: activeRoleId, topic, recipientName: recipient, model: selectedModel }) }); const data = await res.json(); if (data.variants) setDraftVariants(data.variants); } catch {}
    setLoading(false);
  }, [activeRoleId, selectedModel]);

  // When role changes, load threads
  useEffect(() => {
    if (activeRoleId) {
      setDraftVariants(null);
      loadThreads(activeRoleId).then((defaultId) => {
        if (defaultId) loadThreadMessages(activeRoleId, defaultId);
      });
      const isDraft = searchParams.get("draft"), topic = searchParams.get("topic"), recipient = searchParams.get("recipient");
      if (isDraft && topic) handleDraft(topic, recipient || undefined);
    }
  }, [activeRoleId, loadThreads, loadThreadMessages, searchParams, handleDraft]);

  // When active thread changes (user clicks in sidebar), load its messages
  const handleSelectThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    loadThreadMessages(activeRoleId, threadId);
  }, [activeRoleId, loadThreadMessages]);

  // Handle docId param — stored for use after handleSendMessage is defined
  const pendingDocId = searchParams.get("docId");

  const handleSendMessage = async (message: string, attachments?: Array<{ filename: string; text?: string; base64?: string; mimeType?: string }>) => {
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${activeRoleId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, attachments, model: selectedModel, threadId: activeThreadId }),
      });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      if (data.response) setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      // Update thread's message count and updatedAt in local state
      setThreads((prev) => prev.map((t) =>
        t.id === activeThreadId ? { ...t, messageCount: t.messageCount + 2, updatedAt: new Date().toISOString() } : t
      ));
    } catch {
      toast("Failed to send message", "error");
      setMessages((prev) => prev.slice(0, -1));
    }
    setLoading(false);
  };

  const handleClearConversation = async () => {
    await fetch(`/api/conversations/${activeRoleId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: activeThreadId }),
    });
    setMessages([]);
    setThreads((prev) => prev.map((t) =>
      t.id === activeThreadId ? { ...t, messageCount: 0 } : t
    ));
  };

  const handleCreateThread = async (name: string) => {
    try {
      const res = await fetch(`/api/conversations/${activeRoleId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast(err.error || "Failed to create thread", "error");
        return;
      }
      const thread: Thread = await res.json();
      setThreads((prev) => [...prev, thread]);
      setActiveThreadId(thread.id);
      setMessages([]);
      if (threadSidebarCollapsed) setThreadSidebarCollapsed(false);
    } catch {
      toast("Failed to create thread", "error");
    }
  };

  const handleRenameThread = async (threadId: string, name: string) => {
    try {
      const res = await fetch(`/api/conversations/${activeRoleId}/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast(err.error || "Failed to rename thread", "error");
        return;
      }
      const updated = await res.json();
      setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, name: updated.name } : t));
    } catch {
      toast("Failed to rename thread", "error");
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      const res = await fetch(`/api/conversations/${activeRoleId}/threads/${threadId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast(err.error || "Failed to delete thread", "error");
        return;
      }
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      // If deleting the active thread, switch to default
      if (threadId === activeThreadId) {
        const defaultThread = threads.find((t) => t.isDefault);
        if (defaultThread) {
          setActiveThreadId(defaultThread.id);
          loadThreadMessages(activeRoleId, defaultThread.id);
        }
      }
    } catch {
      toast("Failed to delete thread", "error");
    }
  };

  const handleClearThread = async (threadId: string) => {
    await fetch(`/api/conversations/${activeRoleId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId }),
    });
    setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, messageCount: 0 } : t));
    if (threadId === activeThreadId) setMessages([]);
  };

  const activeRole = roles.find((r) => r.id === activeRoleId);
  const activeThread = threads.find((t) => t.id === activeThreadId);

  // AI-specific keyboard shortcuts
  const aiShortcuts: Shortcut[] = useMemo(() => [
    { key: "c", modifiers: ["cmd", "shift"] as const, action: handleClearConversation, description: "Clear conversation", category: "AI Chat" },
  ], [handleClearConversation]);
  useHotkeys(aiShortcuts);

  // Handle docId param — load document into chat
  useEffect(() => {
    if (!pendingDocId || !activeRoleId || docHandledRef.current) return;
    docHandledRef.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/notes/${pendingDocId}`);
        if (!res.ok) return;
        const note = await res.json();
        const uploadMatch = note.content?.match(/^\[Uploaded: (.+?)\]/);
        const transcriptMatch = note.content?.match(/^\[Transcript: (.+?)\]/);
        const filename = uploadMatch ? uploadMatch[1] : transcriptMatch ? `Transcript (${transcriptMatch[1]})` : "document";
        const textContent = note.content?.replace(/^\[(Uploaded|Transcript): .+?\](\[(FileID|TranscriptID): .+?\])?\n\n/, "") || "";
        if (!textContent) return;

        // Create a new thread for this document discussion
        let newThreadId = activeThreadId;
        const threadRes = await fetch(`/api/conversations/${activeRoleId}/threads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: filename }),
        });
        if (threadRes.ok) {
          const thread: Thread = await threadRes.json();
          newThreadId = thread.id;
          setThreads((prev) => [...prev, thread]);
          setActiveThreadId(thread.id);
          setMessages([]);
          if (threadSidebarCollapsed) setThreadSidebarCollapsed(false);
        }

        // Send the initial message directly with the new thread ID
        setLoadedDocName(filename);
        const userMsg = `I want to discuss this document: ${filename}`;
        const attachments = [{ filename, text: textContent.slice(0, 20000), mimeType: "text/plain" }];
        setMessages([{ role: "user", content: userMsg }]);
        setLoading(true);
        try {
          const msgRes = await fetch(`/api/conversations/${activeRoleId}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: userMsg, attachments, model: selectedModel, threadId: newThreadId }),
          });
          if (msgRes.ok) {
            const data = await msgRes.json();
            if (data.response) setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
            setThreads((prev) => prev.map((t) =>
              t.id === newThreadId ? { ...t, messageCount: t.messageCount + 2, updatedAt: new Date().toISOString() } : t
            ));
          }
        } catch {
          toast("Failed to send message", "error");
        }
        setLoading(false);
      } catch {}
    })();
  }, [pendingDocId, activeRoleId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell>
      <div className="ai-fullscreen flex flex-col">
        {/* No API key notice */}
        {hasApiKey === false && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 flex items-center gap-4">
            <Key className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-[15px] font-medium text-[var(--text-primary)]">No API key configured</p>
              <p className="text-[13px] text-[var(--text-tertiary)]">AI features require an Anthropic API key. Add one in Settings to get started.</p>
            </div>
            <Link
              href="/settings?tab=system&sub=apikeys"
              className="px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-[13px] font-medium hover:opacity-90 shrink-0"
            >
              Add API Key
            </Link>
          </div>
        )}

        {/* Document loaded banner */}
        {loadedDocName && (
          <div className="mb-4 rounded-xl border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/5 px-5 py-3 flex items-center gap-3">
            <FileText className="h-5 w-5 text-[var(--accent-blue)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{loadedDocName}</p>
              <p className="text-[12px] text-[var(--text-tertiary)]">Document loaded into conversation — ask questions about it below</p>
            </div>
            <button onClick={() => setLoadedDocName(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-[12px]">Dismiss</button>
          </div>
        )}

        {/* Role tabs + thread name + model selector */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4 shrink-0">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1 flex-1">
            {roles.map((role) => {
              const active = role.id === activeRoleId;
              return (
                <button
                  key={role.id}
                  onClick={() => setActiveRoleId(role.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-[15px] font-medium whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5",
                    active
                      ? "text-white"
                      : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)]"
                  )}
                  style={active ? { backgroundColor: role.color } : undefined}
                >
                  {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />}
                  {role.name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile thread toggle */}
            {threads.length > 1 && (
              <button
                onClick={() => setThreadSidebarCollapsed(!threadSidebarCollapsed)}
                className="lg:hidden w-9 h-9 rounded-lg hover:bg-[var(--sidebar-hover)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors shrink-0"
                title="Toggle threads"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            )}
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-[13px] text-[var(--text-secondary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 shrink-0 cursor-pointer"
            >
              <optgroup label="Claude">
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
              {hasOpenAIKey && (
                <optgroup label="OpenAI">
                  {OPENAI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <FontSizeControl size={font.size} onIncrease={font.increase} onDecrease={font.decrease} atMin={font.atMin} atMax={font.atMax} />
          </div>
        </div>

        {draftVariants && (
          <div className="flex-1 overflow-y-auto">
            <DraftVariants variants={draftVariants} />
            <button onClick={() => setDraftVariants(null)} className="mt-2 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">Back to chat</button>
          </div>
        )}

        {!draftVariants && activeRole && (
          <div className="flex flex-1 min-h-0 gap-0 overflow-hidden">
            {/* Thread sidebar — hidden on mobile unless toggled */}
            <div className={cn(
              "hidden lg:flex",
              !threadSidebarCollapsed && "max-lg:flex max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:bg-[var(--surface)] max-lg:shadow-xl"
            )}>
              <ThreadSidebar
                threads={threads}
                activeThreadId={activeThreadId}
                onSelectThread={handleSelectThread}
                onCreateThread={handleCreateThread}
                onRenameThread={handleRenameThread}
                onDeleteThread={handleDeleteThread}
                onClearThread={handleClearThread}
                collapsed={threadSidebarCollapsed}
                onToggleCollapsed={() => setThreadSidebarCollapsed(!threadSidebarCollapsed)}
              />
            </div>

            {/* Chat area */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <ChatThread
                roleId={activeRoleId}
                roleName={activeRole.name}
                roleColor={activeRole.color}
                roleTitle={activeRole.title}
                messages={messages}
                onSendMessage={handleSendMessage}
                onClearConversation={handleClearConversation}
                loading={loading}
                conductorData={conductorData}
                threadName={activeThread && !activeThread.isDefault ? activeThread.name : undefined}
                fontSize={font.size}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
