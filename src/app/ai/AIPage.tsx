"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ChatThread } from "@/components/ChatThread";
import { DraftVariants } from "@/components/DraftVariants";
import { cn } from "@/lib/utils";

interface Role { id: string; name: string; title: string; color: string; }
interface Message { role: "user" | "assistant"; content: string; timestamp?: string; }
interface DraftVariant { label: string; text: string; }

export function AIPage() {
  const searchParams = useSearchParams();
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRoleId, setActiveRoleId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftVariants, setDraftVariants] = useState<DraftVariant[] | null>(null);

  useEffect(() => {
    fetch("/api/roles").then((r) => r.json()).then((data) => {
      const arr = Array.isArray(data) ? data : [];
      setRoles(arr);
      setActiveRoleId(searchParams.get("roleId") || arr[0]?.id || "");
    }).catch(() => {});
  }, [searchParams]);

  const loadConversation = useCallback(async (roleId: string) => {
    try { const res = await fetch(`/api/conversations/${roleId}`); if (res.ok) { const data = await res.json(); setMessages(Array.isArray(data.messages) ? data.messages : []); } } catch {}
  }, []);

  const handleDraft = useCallback(async (topic: string, recipient?: string) => {
    setLoading(true);
    try { const res = await fetch("/api/ai/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: activeRoleId, topic, recipientName: recipient }) }); const data = await res.json(); if (data.variants) setDraftVariants(data.variants); } catch {}
    setLoading(false);
  }, [activeRoleId]);

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
    try { const res = await fetch(`/api/conversations/${activeRoleId}/message`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, attachments }) }); const data = await res.json(); if (data.response) setMessages((prev) => [...prev, { role: "assistant", content: data.response }]); } catch {}
    setLoading(false);
  };

  const handleClearConversation = async () => { await fetch(`/api/conversations/${activeRoleId}`, { method: "DELETE" }); setMessages([]); };
  const activeRole = roles.find((r) => r.id === activeRoleId);

  return (
    <AppShell>
      <div className="py-4 flex flex-col h-[calc(100vh-80px)] lg:h-[calc(100vh-48px)]">
        {/* Role tabs */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1 mb-4 shrink-0">
          {roles.map((role) => {
            const active = role.id === activeRoleId;
            return (
              <button
                key={role.id}
                onClick={() => setActiveRoleId(role.id)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[14px] font-medium whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5",
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

        {draftVariants && (
          <div className="flex-1 overflow-y-auto">
            <DraftVariants variants={draftVariants} />
            <button onClick={() => setDraftVariants(null)} className="mt-2 text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">Back to chat</button>
          </div>
        )}

        {!draftVariants && activeRole && (
          <ChatThread roleId={activeRoleId} roleName={activeRole.name} roleColor={activeRole.color} roleTitle={activeRole.title} messages={messages} onSendMessage={handleSendMessage} onClearConversation={handleClearConversation} loading={loading} />
        )}
      </div>
    </AppShell>
  );
}
