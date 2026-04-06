"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ChatThread } from "@/components/ChatThread";
import { DraftVariants } from "@/components/DraftVariants";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Key } from "lucide-react";
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

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Fast & capable" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", description: "Fastest, cheapest" },
  { id: "claude-opus-4-6", label: "Opus 4.6", description: "Most capable" },
];

export function AIPage() {
  const searchParams = useSearchParams();
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRoleId, setActiveRoleId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftVariants, setDraftVariants] = useState<DraftVariant[] | null>(null);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [conductorData, setConductorData] = useState<ConductorContext | undefined>();
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/roles").then((r) => r.json()).then((data) => {
      const arr = Array.isArray(data) ? data : [];
      setRoles(arr);
      setActiveRoleId(searchParams.get("roleId") || arr[0]?.id || "");
    }).catch(() => {});
    fetch("/api/context").then((r) => r.json()).then(setConductorData).catch(() => {});
    fetch("/api/profile").then((r) => r.json()).then((p) => {
      setHasApiKey(p.hasAnthropicKey);
    }).catch(() => {});
  }, [searchParams]);

  const loadConversation = useCallback(async (roleId: string) => {
    try { const res = await fetch(`/api/conversations/${roleId}`); if (res.ok) { const data = await res.json(); setMessages(Array.isArray(data.messages) ? data.messages : []); } } catch {}
  }, []);

  const handleDraft = useCallback(async (topic: string, recipient?: string) => {
    setLoading(true);
    try { const res = await fetch("/api/ai/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: activeRoleId, topic, recipientName: recipient, model: selectedModel }) }); const data = await res.json(); if (data.variants) setDraftVariants(data.variants); } catch {}
    setLoading(false);
  }, [activeRoleId, selectedModel]);

  useEffect(() => {
    if (activeRoleId) {
      loadConversation(activeRoleId);
      setDraftVariants(null);
      const isDraft = searchParams.get("draft"), topic = searchParams.get("topic"), recipient = searchParams.get("recipient");
      if (isDraft && topic) handleDraft(topic, recipient || undefined);
    }
  }, [activeRoleId, loadConversation, searchParams, handleDraft]);

  const handleSendMessage = async (message: string, attachments?: Array<{ filename: string; text?: string; base64?: string; mimeType?: string }>) => {
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${activeRoleId}/message`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, attachments, model: selectedModel }) });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      if (data.response) setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      toast("Failed to send message", "error");
      setMessages((prev) => prev.slice(0, -1)); // Remove optimistic user message
    }
    setLoading(false);
  };

  const handleClearConversation = async () => { await fetch(`/api/conversations/${activeRoleId}`, { method: "DELETE" }); setMessages([]); };
  const activeRole = roles.find((r) => r.id === activeRoleId);

  return (
    <AppShell>
      <div className="py-4 flex flex-col h-[calc(100vh-80px)] lg:h-[calc(100vh-48px)]">
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

        {/* Role tabs + model selector */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
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
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-[13px] text-[var(--text-secondary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 shrink-0 cursor-pointer"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {draftVariants && (
          <div className="flex-1 overflow-y-auto">
            <DraftVariants variants={draftVariants} />
            <button onClick={() => setDraftVariants(null)} className="mt-2 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">Back to chat</button>
          </div>
        )}

        {!draftVariants && activeRole && (
          <ChatThread roleId={activeRoleId} roleName={activeRole.name} roleColor={activeRole.color} roleTitle={activeRole.title} messages={messages} onSendMessage={handleSendMessage} onClearConversation={handleClearConversation} loading={loading} conductorData={conductorData} />
        )}
      </div>
    </AppShell>
  );
}
