"use client";

import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import { remainingToday, untilLabel } from "@/lib/meetings-now";

interface Meeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  joinUrl: string | null;
  role: { name: string; color: string };
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour}` : `${hour}:${m.toString().padStart(2, "0")}`;
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

  const rows = meetings ? remainingToday(meetings, minute) : [];
  const first = rows[0];

  // The tab title carries the next meeting, so it reads even when the window is tucked away.
  useEffect(() => {
    document.title = first
      ? `${first.state === "now" ? "Now" : untilLabel(first.startTime, minute)} · ${first.title}`
      : "No more meetings";
  }, [first, minute]);

  return (
    <div className="h-screen overflow-hidden bg-[var(--surface)] text-[var(--text-primary)]">
      {meetings !== null && rows.length === 0 && (
        <p className="px-2 py-1 text-[12px] text-[var(--text-tertiary)] truncate">No more meetings today</p>
      )}
      <ul>
        {rows.map((m) => (
          <li
            key={m.id}
            className={`flex items-center gap-2 px-2 py-1 border-b border-[var(--border-subtle)] ${
              m.state === "later" ? "text-[var(--text-secondary)]" : ""
            }`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: m.role.color }}
              title={m.role.name}
            />
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)] max-[200px]:hidden">
              {formatTime(m.startTime)}–{formatTime(m.endTime)}
            </span>
            <span className={`flex-1 min-w-0 truncate text-[13px] ${m.state === "later" ? "" : "font-medium"}`}>
              {m.title}
            </span>
            {m.state !== "later" && (
              <span
                className={`shrink-0 text-[11px] tabular-nums ${
                  m.state === "now" ? "text-emerald-500" : "text-[var(--text-secondary)]"
                }`}
              >
                {m.state === "now" ? "now" : untilLabel(m.startTime, minute)}
              </span>
            )}
            {m.joinUrl && m.state !== "later" && (
              <a
                href={m.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-emerald-500 hover:bg-[var(--sidebar-hover)]"
                title="Join"
              >
                <Video className="h-3 w-3" />
                <span className="max-[260px]:hidden">Join</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
