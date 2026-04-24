"use client";

import { useState, useCallback, useRef } from "react";

type FormatType = "slack" | "teams" | "email" | "sms";

interface UseFormatMessageReturn {
  state: "idle" | "formatting" | "preview";
  formatted: string | null;
  format: FormatType;
  copied: boolean;
  formatMessage: (rawMessage: string, roleId: string, format: FormatType) => Promise<void>;
  copyToClipboard: () => Promise<void>;
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

  const copyToClipboard = useCallback(async () => {
    if (!formatted) return;

    try {
      if (format === "email") {
        // Rich HTML copy for email
        const htmlBlob = new Blob([formatted], { type: "text/html" });
        const textBlob = new Blob([formatted.replace(/<[^>]+>/g, "")], { type: "text/plain" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": htmlBlob,
            "text/plain": textBlob,
          }),
        ]);
      } else {
        // Plain text copy for Slack, Teams, SMS
        await navigator.clipboard.writeText(formatted);
      }

      setCopied(true);
      if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
      copiedTimeout.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
      copiedTimeout.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [formatted, format]);

  const reset = useCallback(() => {
    setState("idle");
    setFormatted(null);
    setCopied(false);
  }, []);

  return { state, formatted, format, copied, formatMessage, copyToClipboard, reset };
}
