"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Upload, Check, Users, Clock, Trash2, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MeetingPrepPanel } from "@/components/MeetingPrepPanel";
import { useToast } from "@/components/ui/toast";

interface Role {
  id: string;
  name: string;
  color: string;
}

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

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function getMeetingStatus(meeting: Meeting): "past" | "current" | "upcoming" {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = meeting.startTime.split(":").map(Number);
  const [eh, em] = meeting.endTime.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (nowMinutes >= end) return "past";
  if (nowMinutes >= start) return "current";
  return "upcoming";
}

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings");
      if (res.ok) setMeetings(await res.json());
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/roles").then((r) => r.json()),
      fetchMeetings(),
    ]).then(([rolesData]) => {
      setRoles(Array.isArray(rolesData) ? rolesData : []);
    });
  }, [fetchMeetings]);

  const handleUpload = async (file: File) => {
    setSyncing(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const today = new Date().toISOString().split("T")[0];
        const res = await fetch("/api/calendar/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, date: today, trigger: "manual" }),
        });
        const data = await res.json();
        if (data.tasksCreated !== undefined) {
          toast(`${data.meetingsFound} meetings found, ${data.tasksCreated} prep tasks created`, "success");
          fetchMeetings();
        } else {
          toast(data.error || "Sync failed", "error");
        }
        setSyncing(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast("Sync failed", "error");
      setSyncing(false);
    }
  };

  const updateRole = async (meetingId: string, roleId: string) => {
    try {
      await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      setMeetings((prev) =>
        prev.map((m) => {
          if (m.id !== meetingId) return m;
          const role = roles.find((r) => r.id === roleId);
          return { ...m, roleId, role: role ? { id: role.id, name: role.name, color: role.color } : m.role };
        })
      );
      toast("Role updated", "success");
    } catch {
      toast("Failed to update", "error");
    }
  };

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
      toast("Failed to complete task", "error");
    }
  };

  const deleteMeeting = async (id: string) => {
    try {
      await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      setMeetings((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast("Failed to delete", "error");
    }
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <AppShell>
      <div className="py-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-[28px] sm:text-[32px] font-semibold text-[var(--text-primary)] mb-1">Meetings</h1>
            <p className="text-[15px] text-[var(--text-tertiary)]">{dateStr}</p>
          </div>
          <label className={`bg-[var(--accent-blue)] text-white px-4 py-2.5 rounded-xl text-[14px] font-medium hover:opacity-90 transition-opacity ${syncing ? "opacity-50 pointer-events-none" : "cursor-pointer"} inline-flex items-center gap-2 shrink-0 self-start`}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {syncing ? "Processing..." : "Upload screenshot"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={syncing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {!loaded ? (
          <div className="py-20 flex justify-center">
            <div className="w-5 h-5 border-2 border-[var(--border-default)] border-t-[var(--accent-blue)] rounded-full animate-spin" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="py-20 text-center">
            <CalendarDays className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-4 opacity-40" />
            <p className="text-[16px] text-[var(--text-secondary)] mb-2">No meetings synced for today</p>
            <p className="text-[14px] text-[var(--text-tertiary)]">
              Upload a screenshot of your calendar day view to get started.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {meetings.map((meeting) => {
                const status = getMeetingStatus(meeting);
                const isPast = status === "past";
                const isCurrent = status === "current";

                return (
                  <motion.div
                    key={meeting.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    onClick={() => setActiveMeetingId(meeting.id)}
                    className={`
                      rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-all cursor-pointer hover:bg-[var(--sidebar-hover)]
                      ${isPast ? "opacity-40" : ""}
                      ${isCurrent ? "ring-1 ring-[var(--accent-blue)]/30" : ""}
                    `}
                    style={{ borderLeftWidth: "3px", borderLeftColor: meeting.role.color }}
                  >
                    <div className="flex items-start gap-3 sm:gap-4">
                      {/* Time */}
                      <div className="shrink-0 w-[60px] sm:w-[80px] pt-0.5">
                        <p className={`text-[14px] sm:text-[15px] font-medium ${isCurrent ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"}`}>
                          {formatTime(meeting.startTime)}
                        </p>
                        <p className="text-[12px] sm:text-[13px] text-[var(--text-tertiary)]">
                          {formatTime(meeting.endTime)}
                        </p>
                        {isCurrent && (
                          <span className="inline-block mt-1 text-[11px] font-medium text-[var(--accent-blue)] bg-[var(--accent-blue)]/10 px-1.5 py-0.5 rounded-full">
                            NOW
                          </span>
                        )}
                      </div>

                      {/* Content + controls */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[15px] sm:text-[16px] font-medium text-[var(--text-primary)] mb-1">
                            {meeting.title}
                          </p>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteMeeting(meeting.id); }}
                            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                            title="Remove meeting"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {meeting.attendees.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)] mb-2">
                            <Users className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{meeting.attendees.join(", ")}</span>
                          </div>
                        )}

                        {/* Role selector */}
                        <select
                          value={meeting.roleId}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateRole(meeting.id, e.target.value)}
                          className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] bg-[var(--surface-sunken)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all mb-2"
                          style={{ borderColor: meeting.role.color + "60" }}
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>

                        {/* Prep task */}
                        {meeting.prepTask && (
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePrepTask(meeting.prepTask!.id, meeting.prepTask!.done); }}
                            className={`
                              flex items-center gap-2 text-[14px] mt-1 group
                              ${meeting.prepTask.done
                                ? "text-[var(--text-tertiary)] line-through"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              }
                            `}
                          >
                            <span className={`
                              w-[18px] h-[18px] rounded border flex items-center justify-center shrink-0 transition-colors
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

                        {meeting.followUpNotes && (
                          <p className="mt-2 text-[13px] text-amber-400/80 italic">
                            Bring up: {meeting.followUpNotes.split("\n")[0]}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
      {activeMeetingId && (() => {
        const meeting = meetings.find((m) => m.id === activeMeetingId);
        if (!meeting) return null;
        return (
          <MeetingPrepPanel
            meeting={meeting}
            open={true}
            onClose={() => { setActiveMeetingId(null); fetchMeetings(); }}
          />
        );
      })()}
    </AppShell>
  );
}
