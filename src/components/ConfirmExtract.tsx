"use client";

import { useState } from "react";
import { Check, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ExtractedData { tasks: Array<{ title: string; priority: string }>; followUps: Array<{ title: string; waitingOn: string }>; decisions: Array<{ summary: string }>; keyQuotes: Array<{ text: string; speaker?: string }>; }
interface ConfirmExtractProps { data: ExtractedData; roleId: string; roleColor: string; roleName: string; noteId?: string | null; onConfirm: (data: ExtractedData) => void; onDiscard: () => void; }

export function ConfirmExtract({ data, roleId, roleColor, roleName, noteId, onConfirm, onDiscard }: ConfirmExtractProps) {
  const [checkedTasks, setCheckedTasks] = useState<Set<number>>(new Set(data.tasks.map((_, i) => i)));
  const [checkedFollowUps, setCheckedFollowUps] = useState<Set<number>>(new Set(data.followUps.map((_, i) => i)));
  const [checkedDecisions, setCheckedDecisions] = useState<Set<number>>(new Set(data.decisions.map((_, i) => i)));
  const [checkedQuotes, setCheckedQuotes] = useState<Set<number>>(new Set(data.keyQuotes.map((_, i) => i)));

  const toggle = (set: Set<number>, setFn: (s: Set<number>) => void, idx: number) => { const next = new Set(set); if (next.has(idx)) next.delete(idx); else next.add(idx); setFn(next); };
  const handleConfirm = () => { onConfirm({ tasks: data.tasks.filter((_, i) => checkedTasks.has(i)), followUps: data.followUps.filter((_, i) => checkedFollowUps.has(i)), decisions: data.decisions.filter((_, i) => checkedDecisions.has(i)), keyQuotes: data.keyQuotes.filter((_, i) => checkedQuotes.has(i)) }); };

  const totalItems = data.tasks.length + data.followUps.length + data.decisions.length + data.keyQuotes.length;
  const summaryParts: string[] = [];
  if (data.tasks.length > 0) summaryParts.push(`${data.tasks.length} task${data.tasks.length !== 1 ? "s" : ""}`);
  if (data.followUps.length > 0) summaryParts.push(`${data.followUps.length} follow-up${data.followUps.length !== 1 ? "s" : ""}`);
  if (data.decisions.length > 0) summaryParts.push(`${data.decisions.length} decision${data.decisions.length !== 1 ? "s" : ""}`);
  if (data.keyQuotes.length > 0) summaryParts.push(`${data.keyQuotes.length} quote${data.keyQuotes.length !== 1 ? "s" : ""}`);

  const Checkbox = ({ checked, color }: { checked: boolean; color: string }) => checked ? (
    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color }}><Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /></div>
  ) : (
    <div className="w-6 h-6 rounded-lg border-2 border-[var(--border-default)] flex-shrink-0" />
  );

  const rowCls = "flex items-center gap-3 w-full text-left px-3 py-3 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Extracted from transcript</h2>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ backgroundColor: `${roleColor}1a`, color: roleColor }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: roleColor }} />{roleName}
        </span>
      </div>
      <div className="bg-[var(--surface-raised)] rounded-xl p-4">
        <p className="text-[15px] text-[var(--text-secondary)]">Found {totalItems} items: {summaryParts.join(", ")}. Uncheck anything you don&apos;t want to keep.</p>
      </div>

      {data.tasks.length > 0 && (
        <div>
          <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Tasks</p>
          <div className="space-y-1">
            {data.tasks.map((task, i) => { const checked = checkedTasks.has(i); return (
              <button key={i} onClick={() => toggle(checkedTasks, setCheckedTasks, i)} className={rowCls}>
                <Checkbox checked={checked} color={roleColor} />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className={cn("text-base truncate", checked ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] line-through")}>{task.title}</span>
                  {task.priority === "urgent" && <span className="text-[12px] font-bold text-red-400 uppercase shrink-0">URGENT</span>}
                </div>
              </button>
            ); })}
          </div>
        </div>
      )}

      {data.followUps.length > 0 && (
        <div>
          <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Follow-ups</p>
          <div className="space-y-1">
            {data.followUps.map((fu, i) => { const checked = checkedFollowUps.has(i); return (
              <button key={i} onClick={() => toggle(checkedFollowUps, setCheckedFollowUps, i)} className={rowCls}>
                <Checkbox checked={checked} color={roleColor} />
                <div className="flex-1 min-w-0">
                  <span className={cn("text-sm block truncate", checked ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] line-through")}>{fu.title}</span>
                  <span className="text-[13px] text-[var(--text-tertiary)]">Waiting on {fu.waitingOn}</span>
                </div>
              </button>
            ); })}
          </div>
        </div>
      )}

      {data.decisions.length > 0 && (
        <div>
          <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Decisions</p>
          <div className="space-y-2">
            {data.decisions.map((decision, i) => { const checked = checkedDecisions.has(i); return (
              <button key={i} onClick={() => toggle(checkedDecisions, setCheckedDecisions, i)} className="flex items-start gap-3 w-full text-left px-3 py-3 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors">
                <div className="mt-0.5"><Checkbox checked={checked} color={roleColor} /></div>
                <div className="flex-1 border-l-2 pl-3 py-0.5" style={{ borderColor: roleColor }}>
                  <p className={cn("text-sm", checked ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] line-through")}>{decision.summary}</p>
                </div>
              </button>
            ); })}
          </div>
        </div>
      )}

      {data.keyQuotes.length > 0 && (
        <div>
          <p className="text-[13px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-3">Key Quotes</p>
          <div className="space-y-2">
            {data.keyQuotes.map((quote, i) => { const checked = checkedQuotes.has(i); return (
              <button key={i} onClick={() => toggle(checkedQuotes, setCheckedQuotes, i)} className="flex items-start gap-3 w-full text-left px-3 py-3 rounded-xl hover:bg-[var(--sidebar-hover)] transition-colors">
                <div className="mt-0.5"><Checkbox checked={checked} color={roleColor} /></div>
                <div className="flex-1 border-l-2 pl-3 py-0.5" style={{ borderColor: roleColor }}>
                  <p className={cn("text-sm", checked ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] line-through")}>&ldquo;{quote.text}&rdquo;</p>
                  {quote.speaker && <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">&mdash; {quote.speaker}</p>}
                </div>
              </button>
            ); })}
          </div>
        </div>
      )}

      <div className="space-y-2 pt-2">
        <button onClick={handleConfirm} className="w-full py-3.5 text-white font-semibold rounded-xl transition-all hover:opacity-90 active:scale-[0.98]" style={{ backgroundColor: roleColor }}>Confirm</button>
        {noteId && (
          <Link
            href={`/ai?roleId=${roleId}&docId=${noteId}`}
            className="w-full text-center text-[15px] text-[var(--accent-blue)] font-medium py-2.5 rounded-xl border border-[var(--accent-blue)]/30 hover:bg-[var(--accent-blue)]/5 transition-colors flex items-center justify-center gap-2"
          >
            <MessageSquare className="h-4 w-4" /> Discuss in AI
          </Link>
        )}
        <button onClick={onDiscard} className="w-full text-center text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] py-2 transition-colors">Discard all</button>
      </div>
    </div>
  );
}
