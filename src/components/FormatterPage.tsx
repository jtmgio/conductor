"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { AppShell } from "./AppShell";
import { useFormatMessage } from "@/hooks/useFormatMessage";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Loader2, PenLine } from "lucide-react";

type FormatType = "slack" | "teams" | "email" | "sms";
const PLATFORMS: { value: FormatType; label: string }[] = [
  { value: "slack", label: "Slack" },
  { value: "teams", label: "Teams" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

interface Role {
  id: string;
  name: string;
  color: string;
  active?: boolean;
}

interface Recent {
  input: string;
  output: string;
  platform: FormatType;
  roleName: string;
  at: number;
}

// Slack mrkdwn → markdown, for the preview only (ReactMarkdown reads *x* as italic).
// Copy grabs the rendered HTML so it pastes into Slack correctly. Code spans untouched.
function mrkdwnToMarkdown(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((seg) => {
      if (seg.startsWith("`")) return seg;
      return seg
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/gm, "$1**$2**")
        .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/gm, "$1*$2*")
        .replace(/(^|[\s(])~([^~\n]+)~(?=[\s.,;:!?)]|$)/gm, "$1~~$2~~");
    })
    .join("");
}

export function FormatterPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState("");
  const [platform, setPlatform] = useState<FormatType>("slack");
  const [input, setInput] = useState("");
  const [recents, setRecents] = useState<Recent[]>([]);
  const fmt = useFormatMessage();
  const previewRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => (r.ok ? r.json() : []))
      .then((rs: Role[]) => {
        const active = rs.filter((r) => r.active !== false);
        setRoles(active);
        setRoleId((cur) => cur || active[0]?.id || "");
      })
      .catch(() => {});
    try {
      const raw = localStorage.getItem("conductor-format-recents");
      if (raw) setRecents(JSON.parse(raw));
    } catch {}
  }, []);

  const run = useCallback(() => {
    if (!input.trim() || !roleId) return;
    savedRef.current = false;
    fmt.formatMessage(input, roleId, platform);
  }, [input, roleId, platform, fmt]);

  // Save to recents once when a preview lands
  useEffect(() => {
    if (fmt.state === "preview" && fmt.formatted && !savedRef.current) {
      savedRef.current = true;
      const entry: Recent = { input, output: fmt.formatted, platform: fmt.format, roleName: roles.find((r) => r.id === roleId)?.name || "", at: Date.now() };
      setRecents((prev) => {
        const next = [entry, ...prev].slice(0, 8);
        try {
          localStorage.setItem("conductor-format-recents", JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, [fmt.state, fmt.formatted, fmt.format, input, roleId, roles]);

  const preview = fmt.formatted ? (platform === "slack" ? mrkdwnToMarkdown(fmt.formatted) : fmt.formatted) : "";

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl pt-1">
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--text-primary)]">Formatter</h1>
        <p className="mt-1 text-[14px] text-[var(--text-tertiary)]">Rewrite a rough draft in your voice, with the right tone and formatting for the platform.</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Left — compose */}
          <div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste or type your rough message…"
              className="min-h-[180px] w-full resize-y rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:border-[var(--border-strong)]"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2.5 text-[13px] font-medium text-[var(--text-primary)] outline-none"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <div className="flex overflow-hidden rounded-xl border border-[var(--border-subtle)]">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPlatform(p.value)}
                    className={`px-3 py-2.5 text-[13px] font-medium transition-colors ${
                      platform === p.value ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={run}
              disabled={!input.trim() || !roleId || fmt.state === "formatting"}
              className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 py-3 text-[14px] font-semibold text-[var(--surface)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {fmt.state === "formatting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
              Format in my voice
            </button>
          </div>

          {/* Right — result */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            {fmt.state === "preview" && fmt.formatted ? (
              <>
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{PLATFORMS.find((p) => p.value === fmt.format)?.label} · in your voice</span>
                  <button
                    onClick={() => fmt.copyToClipboard(previewRef.current)}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--text-primary)] transition-colors hover:opacity-90"
                  >
                    {fmt.copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {fmt.copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div
                  ref={previewRef}
                  className="p-4 text-[14px] leading-relaxed text-[var(--text-primary)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--surface)] [&_code]:px-1 [&_em]:italic [&_h1]:mb-2 [&_h1]:text-[18px] [&_h1]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2.5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
                </div>
              </>
            ) : fmt.state === "formatting" ? (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-[var(--text-tertiary)]">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-[13px]">Rewriting in your voice…</span>
              </div>
            ) : (
              <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-[13.5px] text-[var(--text-tertiary)]">
                Your rewritten message appears here — pick a company + platform and hit format.
              </div>
            )}
          </div>
        </div>

        {/* Recents */}
        {recents.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Recent</p>
            <div className="flex flex-col gap-1.5">
              {recents.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(r.input);
                    setPlatform(r.platform);
                    const role = roles.find((x) => x.name === r.roleName);
                    if (role) setRoleId(role.id);
                  }}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--text-secondary)]">{r.input}</span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    {r.roleName} · {r.platform}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
