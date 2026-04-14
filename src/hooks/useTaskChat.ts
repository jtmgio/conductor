"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export function useTaskChat(taskId: string | null, roleId: string, taskTitle: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const threadIdRef = useRef<string | null>(null);
  const prevTaskIdRef = useRef<string | null>(null);

  // Load existing thread when taskId changes
  useEffect(() => {
    if (!taskId || !roleId) {
      setMessages([]);
      threadIdRef.current = null;
      return;
    }

    // Don't refetch if same task
    if (taskId === prevTaskIdRef.current) return;
    prevTaskIdRef.current = taskId;

    setLoading(true);
    fetch(`/api/conversations/${roleId}/task-thread/${taskId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.threadId) {
          threadIdRef.current = data.threadId;
          setMessages(data.messages || []);
        } else {
          threadIdRef.current = null;
          setMessages([]);
        }
      })
      .catch(() => {
        threadIdRef.current = null;
        setMessages([]);
      })
      .finally(() => setLoading(false));
  }, [taskId, roleId]);

  const sendMessage = useCallback(async (
    text: string,
    attachments?: Array<{ filename: string; text?: string; base64?: string; mimeType?: string }>
  ) => {
    if (!taskId || !roleId || !text.trim()) return;

    setSending(true);

    // Optimistic: add user message immediately
    const userMsg: Message = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // Create thread if it doesn't exist
      if (!threadIdRef.current) {
        const threadName = `Task: ${taskTitle}`.slice(0, 50);
        const threadRes = await fetch(`/api/conversations/${roleId}/threads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: threadName, taskId }),
        });
        const threadData = await threadRes.json();
        threadIdRef.current = threadData.id;
      }

      // Send message
      const res = await fetch(`/api/conversations/${roleId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          attachments,
          threadId: threadIdRef.current,
          taskId,
        }),
      });

      const data = await res.json();
      if (data.response) {
        const assistantMsg: Message = { role: "assistant", content: data.response, timestamp: new Date().toISOString() };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch {
      // Remove optimistic message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }, [taskId, roleId, taskTitle]);

  const clearConversation = useCallback(async () => {
    if (!threadIdRef.current || !roleId) return;
    try {
      await fetch(`/api/conversations/${roleId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: threadIdRef.current }),
      });
      setMessages([]);
    } catch {}
  }, [roleId]);

  return { messages, loading, sending, sendMessage, clearConversation };
}
