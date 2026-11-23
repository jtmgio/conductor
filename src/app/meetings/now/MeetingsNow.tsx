"use client";

import { useEffect, useState } from "react";
import { Calendar, Check, Trash2, Video } from "lucide-react";
import { remainingToday, untilLabel } from "@/lib/meetings-now";

interface Meeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  joinUrl: string | null;
  role: { name: string; color: string };
}

// Same format as AgendaStrip: "10:30 AM", "11 AM".
function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function MeetingsNow() {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [minute, setMinute] = useState(nowMinutes);

  // Same source as AgendaStrip; calendar sync lands every 10 min, so a minute is plenty.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/meetings");
        if (res.status === 401) return window.location.assign("/login");
        if (res.ok && alive) setMeetings(await res.json());
      } catch {
        // Offline: keep the last good list.
      }
    };
    load();
    const poll = setInterval(load, 60_000);
    const tick = setInterval(() => setMinute(nowMinutes()), 10_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  // Same soft-delete the Today card uses: the meeting is hidden (userHidden), never removed,
  // so calendar sync won't bring it back. It also drops out of the Mac alert.
  const hide = async (id: string) => {
    setMeetings((prev) => prev?.filter((m) => m.id !== id) ?? prev);
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      const res = await fetch("/api/meetings").catch(() => null);
      if (res?.ok) setMeetings(await res.json());
    }
  };

  const rows = meetings ? remainingToday(meetings, minute) : [];
  const first = rows[0];

  // The tab title carries the next meeting, so it reads even when the window is tucked away.
  useEffect(() => {
    document.title = first
      ? `${first.state === "now" ? "Now" : untilLabel(first.startTime, minute)} · ${first.title}`
      : "No more meetings";
  }, [first, minute]);

  // The look is AgendaStrip's "Today's Meetings" card on the Today page, minus the
  // editing controls (delete, prep tasks) — this window is for glancing, not managing.
  return (
    <div className="h-screen overflow-y-auto bg-[var(--surface)] text-[var(--text-primary)] p-2 max-[380px]:p-0">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden max-[380px]:rounded-none max-[380px]:border-0">
        <div className="flex items-center gap-2.5 px-4 py-3 min-w-0 max-[380px]:px-3 max-[380px]:py-2">
          <Calendar className="h-4 w-4 shrink-0 text-[var(--accent-blue)]" />
          <span className="text-[14px] font-medium text-[var(--text-primary)] shrink-0">Today&apos;s Meetings</span>
          {rows.length > 0 && (
            <span className="text-[13px] text-[var(--text-tertiary)] truncate max-[340px]:hidden">
              {formatTime(rows[0].startTime)} – {formatTime(rows[rows.length - 1].endTime)}
            </span>
          )}
        </div>

        {meetings !== null && rows.length === 0 && (
          <div className="flex items-center gap-2.5 px-4 pb-4">
            <span className="text-[13.5px] font-medium text-[var(--text-secondary)]">All meetings done for the day</span>
            <Check className="h-4 w-4 text-emerald-500" />
          </div>
        )}

        {rows.length > 0 && (
          <div className="px-3 pb-3 flex flex-col gap-1.5 max-[380px]:px-1.5 max-[380px]:pb-1.5 max-[380px]:gap-0.5">
            {rows.map((m) => {
              const highlighted = m.state !== "later";
              const isNow = m.state === "now";
              return (
                <div
                  key={m.id}
                  className={`group/row flex items-start gap-3 px-3.5 py-3 rounded-xl max-[380px]:gap-2 max-[380px]:px-2.5 max-[380px]:py-2 ${
                    highlighted ? "bg-[var(--surface-sunken)] ring-1 ring-[var(--border-subtle)]" : ""
                  }`}
                  style={highlighted ? { borderLeft: `3px solid ${m.role.color}` } : undefined}
                >
                  <div className="flex flex-col items-end shrink-0 w-[72px] pt-0.5 max-[380px]:hidden">
                    <span className={`text-[13px] font-medium ${isNow ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"}`}>
                      {formatTime(m.startTime)}
                    </span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">{formatTime(m.endTime)}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className={`hidden max-[380px]:block text-[12px] font-medium tabular-nums mb-0.5 ${
                        isNow ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {formatTime(m.startTime)} – {formatTime(m.endTime)}
                    </div>
                    <div className="flex items-start gap-2 mb-0.5">
                      <span className="w-2 h-2 rounded-full shrink-0 mt-[7px]" style={{ backgroundColor: m.role.color }} />
                      <span className="min-w-0 text-[14px] font-medium text-[var(--text-primary)] leading-snug line-clamp-2 max-[380px]:text-[13px]" title={m.title}>{m.title}</span>
                      {isNow && (
                        <span className="text-[11px] font-medium text-[var(--accent-blue)] bg-[var(--accent-blue)]/10 px-1.5 py-0.5 rounded-full shrink-0">
                          NOW
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-[var(--text-tertiary)] whitespace-nowrap min-w-0">
                      <span className="truncate">{m.role.name}</span>
                      {m.state === "next" && <span className="shrink-0">{untilLabel(m.startTime, minute)}</span>}
                    </div>
                  </div>

                  {m.joinUrl && highlighted && (
                    <a
                      href={m.joinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 self-start inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                    >
                      <Video className="h-3.5 w-3.5" />
                      Join
                    </a>
                  )}

                  <button
                    onClick={() => hide(m.id)}
                    className="shrink-0 self-start p-1.5 -mr-1 rounded opacity-30 group-hover/row:opacity-70 hover:!opacity-100 hover:bg-[var(--surface-sunken)] hover:text-red-400 transition-all text-[var(--text-tertiary)]"
                    aria-label="Delete meeting"
                    title="Delete meeting"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
