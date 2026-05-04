"use client";

import { useState, useCallback, useRef } from "react";

type FormatType = "slack" | "teams" | "email" | "sms";

interface UseFormatMessageReturn {
  state: "idle" | "formatting" | "preview";
  formatted: string | null;
  format: FormatType;
  copied: boolean;
  formatMessage: (rawMessage: string, roleId: string, format: FormatType) => Promise<void>;
  copyToClipboard: (previewEl?: HTMLElement | null) => Promise<void>;
  reset: () => void;
}

export function useFormatMessage(): UseFormatMessageReturn {
  const [state, setState] = useState<"idle" | "formatting" | "preview">("idle");
  const [formatted, setFormatted] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatType>("slack");
  const [copied, setCopied] = useState(false);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout>>();

  const formatMessage = useCallback(async (rawMessage: string, roleId: string, fmt: FormatType) => {
    setState("formatting");
    setFormat(fmt);

    try {
      const res = await fetch("/api/ai/format-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, rawMessage, format: fmt }),
      });

      const data = await res.json();

      if (res.ok && data.formatted) {
        setFormatted(data.formatted);
        setState("preview");
      } else {
        setFormatted(rawMessage);
        setState("preview");
      }
    } catch {
      setFormatted(rawMessage);
      setState("preview");
    }
  }, []);

  const copyToClipboard = useCallback(async (previewEl?: HTMLElement | null) => {
    if (!formatted) return;

    try {
      // Grab rendered HTML from the preview DOM element (same approach as AI chat page)
      let html = previewEl?.innerHTML || formatted;
      // Add line breaks between block elements so paste preserves paragraph spacing
      // Exclude li/ul/ol — injecting <br> between list items breaks list rendering in Slack/Teams
      html = html.replace(/<\/(p|h[1-6]|blockquote)>\s*</g, "</$1><br><");
      const plainText = previewEl?.innerText || formatted.replace(/<[^>]+>/g, "");

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);

      setCopied(true);
      if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
      copiedTimeout.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
      copiedTimeout.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [formatted]);

  const reset = useCallback(() => {
    setState("idle");
    setFormatted(null);
    setCopied(false);
  }, []);

  return { state, formatted, format, copied, formatMessage, copyToClipboard, reset };
}
