"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown, ChevronUp, Check, Users, Bell } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useMeetingNotifications } from "@/hooks/useMeetingNotifications";
import { MeetingPrepPanel } from "./MeetingPrepPanel";

interface Meeting {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  isIgnored: boolean;
  followUpNotes: string | null;
  roleId: string;
  meetingNoteId?: string | null;
  aiPrepContent?: string | null;
  role: { id: string; name: string; color: string };
  prepTask: { id: string; title: string; done: boolean } | null;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function getMeetingStatus(meeting: Meeting): "past" | "current" | "upcoming" {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(meeting.startTime);
  const end = timeToMinutes(meeting.endTime);
  if (nowMinutes >= end) return "past";
  if (nowMinutes >= start) return "current";
  return "upcoming";
}

interface AgendaStripProps {
  mode?: "strip" | "sidebar";
  sidebarCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AgendaStrip({ mode = "strip", sidebarCollapsed = false, onToggleCollapse }: AgendaStripProps = {}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [prepMeeting, setPrepMeeting] = useState<Meeting | null>(null);
  const { toast } = useToast();

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings");
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  // Re-evaluate meeting statuses every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Poll for calendar sync changes — refetch meetings when a new sync lands
  const lastSyncRef = useRef<string | null>(null);
  useEffect(() => {
    const checkSync = async () => {
      try {
        const res = await fetch("/api/calendar/last-sync");
        if (res.ok) {
          const { lastSyncAt } = await res.json();
          if (lastSyncAt && lastSyncAt !== lastSyncRef.current) {
            lastSyncRef.current = lastSyncAt;
            fetchMeetings();
          }
        }
      } catch {}
    };
    // Check immediately on mount to set baseline, then every 15s
    checkSync();
    const interval = setInterval(checkSync, 15_000);
    return () => clearInterval(interval);
  }, [fetchMeetings]);

  // Notifications + prep alert
  const handleMeetingAlert = useCallback((meeting: Meeting) => {
    setPrepMeeting(meeting);
  }, []);
  useMeetingNotifications(meetings, { onMeetingAlert: handleMeetingAlert });

  const togglePrepTask = async (taskId: string, currentDone: boolean) => {
    const newDone = !currentDone;
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: newDone }),
      });
      setMeetings((prev) =>
        prev.map((m) =>
          m.prepTask?.id === taskId
            ? { ...m, prepTask: { ...m.prepTask!, done: newDone } }
            : m
        )
      );
    } catch {
      toast("Failed to update task", "error");
    }
  };

  if (!loaded || meetings.length === 0) return null;

  const currentOrNext = meetings.find((m) => {
    const status = getMeetingStatus(m);
    return status === "current" || status === "upcoming";
  });

  // ── Sidebar mode (desktop 2-column layout) ──
  if (mode === "sidebar") {
    return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="h-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--sidebar-hover)] transition-colors shrink-0 border-b border-[var(--border-subtle)]"
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--accent-blue)] shrink-0" />
            {!sidebarCollapsed && (
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                Today&apos;s Meetings
              </span>
            )}
          </div>
          {sidebarCollapsed ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
          )}
        </button>

        {/* Meeting list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {sidebarCollapsed ? (
            // Collapsed: compact time + title rows (hide past meetings)
            <div className="py-1.5">
              {meetings.filter((m) => getMeetingStatus(m) !== "past").map((meeting) => {
                const status = getMeetingStatus(meeting);
                const isCurrent = status === "current";
                const isPast = status === "past";
                const isHighlighted = meeting.id === currentOrNext?.id;

                return (
                  <div
                    key={meeting.id}
                    onClick={() => setPrepMeeting(meeting)}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 transition-all cursor-pointer hover:bg-[var(--sidebar-hover)]
                      ${isPast ? "opacity-35" : ""}
                      ${isHighlighted ? "bg-[var(--surface-sunken)]" : ""}
                    `}
                    style={isHighlighted ? { borderLeft: `2px solid ${meeting.role.color}` } : { borderLeft: "2px solid transparent" }}
                  >
                    <span className={`text-[11px] font-mono tabular-nums shrink-0 ${isCurrent ? "text-[var(--accent-blue)] font-medium" : "text-[var(--text-tertiary)]"}`}>
                      {formatTime(meeting.startTime).replace(" ", "")}
                    </span>
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: meeting.role.color }}
                    />
                    <span className="text-[12px] text-[var(--text-secondary)] truncate">
                      {meeting.title}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] font-bold text-[var(--accent-blue)] shrink-0">NOW</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Expanded: full meeting cards
            <div className="px-3 py-3 flex flex-col gap-1">
              {meetings.map((meeting) => {
                const status = getMeetingStatus(meeting);
                const isCurrent = status === "current";
                const isPast = status === "past";
                const isHighlighted = meeting.id === currentOrNext?.id;

                return (
                  <div
                    key={meeting.id}
                    onClick={() => setPrepMeeting(meeting)}
                    className={`
                      flex items-center gap-2.5 rounded-xl transition-all overflow-hidden cursor-pointer hover:bg-[var(--sidebar-hover)]
                      ${isPast ? "opacity-30 py-1 px-3" : "px-3 py-2.5"}
                      ${isHighlighted ? "bg-[var(--surface-sunken)] ring-1 ring-[var(--border-subtle)]" : ""}
                    `}
                    style={isHighlighted ? { borderLeft: `3px solid ${meeting.role.color}` } : undefined}
                  >
                    {isPast ? (
                      <>
                        {/* Past: compact single line */}
                        <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">
                          {formatTime(meeting.startTime)}
                        </span>
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0 opacity-50"
                          style={{ backgroundColor: meeting.role.color }}
                        />
                        <span className="text-[12px] text-[var(--text-tertiary)] line-through truncate">
                          {meeting.title}
                        </span>
                      </>
                    ) : (
                    <>
                    {/* Time column */}
                    <div className="flex flex-col items-end shrink-0 w-[56px] pt-0.5">
                      <span className={`text-[12px] font-medium ${isCurrent ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"}`}>
                        {formatTime(meeting.startTime)}
                      </span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {formatTime(meeting.endTime)}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: meeting.role.color }}
                        />
                        <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                          {meeting.title}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-medium text-[var(--accent-blue)] bg-[var(--accent-blue)]/10 px-1 py-0.5 rounded-full shrink-0">
                            NOW
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-[var(--text-tertiary)]">{meeting.role.name}</span>

                    </div>
                    </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Notification prompt at bottom */}
        {!sidebarCollapsed && <NotificationPrompt />}
      </motion.div>

      {/* Meeting Prep Panel */}
      {prepMeeting && (
        <MeetingPrepPanel
          meeting={prepMeeting}
          open={!!prepMeeting}
          onClose={() => setPrepMeeting(null)}
        />
      )}
    </>
    );
  }

  // ── Strip mode (original stacked layout for mobile) ──
  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--sidebar-hover)] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Calendar className="h-4 w-4 text-[var(--accent-blue)]" />
          <span className="text-[14px] font-medium text-[var(--text-primary)]">
            Today&apos;s Meetings
          </span>
          <span className="text-[13px] text-[var(--text-tertiary)]">
            {formatTime(meetings[0].startTime)} – {formatTime(meetings[meetings.length - 1].endTime)}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
        ) : (
          <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />
        )}
      </button>

      {/* Meeting list */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-1.5">
              {meetings.map((meeting) => {
                const status = getMeetingStatus(meeting);
                const isCurrent = status === "current";
                const isPast = status === "past";
                const isHighlighted = meeting.id === currentOrNext?.id;

                return (
                  <div
                    key={meeting.id}
                    onClick={() => setPrepMeeting(meeting)}
                    className={`
                      flex items-start gap-3 px-3.5 py-3 rounded-xl transition-all cursor-pointer hover:bg-[var(--sidebar-hover)]
                      ${isPast ? "opacity-40" : ""}
                      ${isHighlighted ? "bg-[var(--surface-sunken)] ring-1 ring-[var(--border-subtle)]" : ""}
                    `}
                    style={isHighlighted ? { borderLeft: `3px solid ${meeting.role.color}` } : undefined}
                  >
                    {/* Time column */}
                    <div className="flex flex-col items-end shrink-0 w-[72px] pt-0.5">
                      <span className={`text-[13px] font-medium ${isCurrent ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"}`}>
                        {formatTime(meeting.startTime)}
                      </span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        {formatTime(meeting.endTime)}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: meeting.role.color }}
                        />
                        <span className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                          {meeting.title}
                        </span>
                        {isCurrent && (
                          <span className="text-[11px] font-medium text-[var(--accent-blue)] bg-[var(--accent-blue)]/10 px-1.5 py-0.5 rounded-full shrink-0">
                            NOW
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[12px] text-[var(--text-tertiary)]">
                        <span>{meeting.role.name}</span>
                        {meeting.attendees.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {meeting.attendees.length <= 3
                              ? meeting.attendees.join(", ")
                              : `${meeting.attendees.slice(0, 2).join(", ")} +${meeting.attendees.length - 2}`}
                          </span>
                        )}
                      </div>

                      {/* Prep task */}
                      {meeting.prepTask && !isPast && (
                        <button
                          onClick={() => togglePrepTask(meeting.prepTask!.id, meeting.prepTask!.done)}
                          className={`
                            mt-2 flex items-center gap-2 text-[13px] group
                            ${meeting.prepTask.done
                              ? "text-[var(--text-tertiary)] line-through"
                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }
                          `}
                        >
                          <span className={`
                            w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                            ${meeting.prepTask.done
                              ? "bg-green-500/20 border-green-500/40 text-green-400"
                              : "border-[var(--border-default)] group-hover:border-[var(--accent-blue)]"
                            }
                          `}>
                            {meeting.prepTask.done && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">
                            {meeting.prepTask.title.replace(/^\d{1,2}:\d{2}\s*[—–-]\s*/, "")}
                          </span>
                        </button>
                      )}

                      {/* Follow-up notes */}
                      {meeting.followUpNotes && !isPast && (
                        <p className="mt-1.5 text-[12px] text-amber-400/80 italic">
                          Bring up: {meeting.followUpNotes.split("\n")[0]}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Notification permission prompt */}
            <NotificationPrompt />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    {/* Meeting Prep Panel */}
    {prepMeeting && (
      <MeetingPrepPanel
        meeting={prepMeeting}
        open={!!prepMeeting}
        onClose={() => setPrepMeeting(null)}
      />
    )}
    </>
  );
}

function NotificationPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    const dismissed = localStorage.getItem("conductor-notif-dismissed");
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="px-5 pb-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
        <Bell className="h-3.5 w-3.5" />
        <span>Get a heads-up before meetings?</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            await Notification.requestPermission();
            setShow(false);
          }}
          className="text-[12px] text-[var(--accent-blue)] hover:underline"
        >
          Enable
        </button>
        <button
          onClick={() => {
            localStorage.setItem("conductor-notif-dismissed", Date.now().toString());
            setShow(false);
          }}
          className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
