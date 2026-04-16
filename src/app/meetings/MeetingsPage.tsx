"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Users, Trash2, Loader2, Search, EyeOff, Eye, Upload } from "lucide-react";
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
  userHidden: boolean;
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

function todayLocal(): string {
  return new Date().toISOString().split("T")[0];
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

// Group meetings by relative bucket: Today / Yesterday / This week / Last week / Month
function bucketLabel(dateStr: string, today: string): string {
  const delta = diffDays(dateStr, today); // today - dateStr; positive = past
  if (delta === 0) return "Today";
  if (delta === -1) return "Tomorrow";
  if (delta === 1) return "Yesterday";
  if (delta < 0 && delta >= -7) return "Upcoming";
  if (delta > 1 && delta <= 7) return "Earlier this week";
  if (delta > 7 && delta <= 14) return "Last week";
  // Older: group by month + year
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface HistoryResponse {
  meetings: Meeting[];
  range: { from: string; before: string };
  nextBefore: string;
}

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const today = useMemo(() => todayLocal(), []);

  // Debounce search input (250ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Reset + reload when filters change
  const loadFirst = useCallback(async () => {
    setLoaded(false);
    setReachedEnd(false);
    const params = new URLSearchParams({ history: "1", days: "30" });
    if (roleFilter) params.set("roleId", roleFilter);
    if (searchDebounced) params.set("q", searchDebounced);
    if (showHidden) params.set("includeHidden", "1");
    try {
      const res = await fetch(`/api/meetings?${params}`);
      if (res.ok) {
        const data: HistoryResponse = await res.json();
        setMeetings(data.meetings);
        setNextBefore(data.nextBefore);
        if (data.meetings.length === 0) setReachedEnd(true);
      }
    } catch {}
    setLoaded(true);
  }, [roleFilter, searchDebounced, showHidden]);

  useEffect(() => {
    fetch("/api/roles").then((r) => r.json()).then((rolesData) => {
      setRoles(Array.isArray(rolesData) ? rolesData : []);
    });
  }, []);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore || reachedEnd) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ history: "1", days: "30", before: nextBefore });
    if (roleFilter) params.set("roleId", roleFilter);
    if (searchDebounced) params.set("q", searchDebounced);
    if (showHidden) params.set("includeHidden", "1");
    try {
      const res = await fetch(`/api/meetings?${params}`);
      if (res.ok) {
        const data: HistoryResponse = await res.json();
        if (data.meetings.length === 0) {
          setReachedEnd(true);
        } else {
          setMeetings((prev) => [...prev, ...data.meetings]);
          setNextBefore(data.nextBefore);
        }
      }
    } catch {}
    setLoadingMore(false);
  }, [nextBefore, loadingMore, reachedEnd, roleFilter, searchDebounced, showHidden]);

  const deleteMeeting = async (id: string, title: string) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast(`Hid "${title}" from agenda`, "success");
    } catch {
      toast("Failed to delete meeting", "error");
      loadFirst();
    }
  };

  const handleUpload = async (file: File) => {
    setSyncing(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/calendar/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, date: today, trigger: "manual" }),
        });
        const data = await res.json();
        if (data.tasksCreated !== undefined) {
          toast(`${data.meetingsFound} meetings, ${data.tasksCreated} prep tasks`, "success");
          loadFirst();
        } else {
          toast(data.error || "Sync failed", "error");
        }
      } catch {
        toast("Sync failed", "error");
      }
      setSyncing(false);
    };
    reader.readAsDataURL(file);
  };

  // Group meetings by bucket → array of { bucket, dates: [{ date, meetings }] }
  const grouped = useMemo(() => {
    const buckets: { bucket: string; dates: { date: string; meetings: Meeting[] }[] }[] = [];
    let currentBucket: { bucket: string; dates: { date: string; meetings: Meeting[] }[] } | null = null;
    let currentDate: { date: string; meetings: Meeting[] } | null = null;

    for (const m of meetings) {
      const bucket = bucketLabel(m.date, today);
      if (!currentBucket || currentBucket.bucket !== bucket) {
        currentBucket = { bucket, dates: [] };
        buckets.push(currentBucket);
        currentDate = null;
      }
      if (!currentDate || currentDate.date !== m.date) {
        currentDate = { date: m.date, meetings: [] };
        currentBucket.dates.push(currentDate);
      }
      currentDate.meetings.push(m);
    }
    return buckets;
  }, [meetings, today]);

  const activeMeeting = meetings.find((m) => m.id === activeMeetingId);

  return (
    <AppShell>
      <div className="py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-[28px] sm:text-[32px] font-semibold text-[var(--text-primary)] mb-1">Meetings</h1>
            <p className="text-[14px] text-[var(--text-tertiary)]">Browse all past, current, and upcoming meetings</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowHidden((v) => !v)}
              className={`px-3 py-2 rounded-lg text-[13px] font-medium border transition-colors inline-flex items-center gap-1.5 ${
                showHidden
                  ? "bg-[var(--accent-blue)]/10 border-[var(--accent-blue)]/40 text-[var(--accent-blue)]"
                  : "bg-[var(--surface-raised)] border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
              title={showHidden ? "Hiding hidden meetings" : "Showing hidden meetings"}
            >
              {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showHidden ? "Showing hidden" : "Show hidden"}
            </button>
            <label
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium border transition-colors ${
                syncing
                  ? "opacity-50 pointer-events-none bg-[var(--surface-raised)] border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                  : "cursor-pointer bg-[var(--surface-raised)] border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
              title="Manually upload a calendar screenshot"
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload
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
        </div>

        {/* Search + role filters */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meeting titles…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/20"
            />
          </div>

          {roles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setRoleFilter(null)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                  roleFilter === null
                    ? "bg-[var(--text-primary)] text-[var(--surface)] border-[var(--text-primary)]"
                    : "bg-[var(--surface-raised)] border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                All roles
              </button>
              {roles.map((r) => {
                const active = roleFilter === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRoleFilter(active ? null : r.id)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors inline-flex items-center gap-1.5 ${
                      active
                        ? "text-[var(--text-primary)]"
                        : "bg-[var(--surface-raised)] border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    }`}
                    style={
                      active
                        ? { backgroundColor: r.color + "22", borderColor: r.color + "80" }
                        : undefined
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: r.color }}
                    />
                    {r.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* List */}
        {!loaded ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="py-20 text-center">
            <CalendarDays className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-4 opacity-40" />
            <p className="text-[16px] text-[var(--text-secondary)] mb-2">
              {searchDebounced || roleFilter ? "No meetings match your filters" : "No meetings yet"}
            </p>
            <p className="text-[13px] text-[var(--text-tertiary)]">
              {searchDebounced || roleFilter
                ? "Try widening your search or clearing filters"
                : "Calendar sync should populate this automatically"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map((bucketGroup) => (
              <div key={bucketGroup.bucket} className="flex flex-col gap-4">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] sticky top-0 bg-[var(--surface)] py-1 z-10">
                  {bucketGroup.bucket}
                </h2>
                {bucketGroup.dates.map((dateGroup) => (
                  <div key={dateGroup.date} className="flex flex-col gap-1.5">
                    <h3 className="text-[12px] font-medium text-[var(--text-tertiary)] mb-1">
                      {formatDateHeader(dateGroup.date)}
                    </h3>
                    <AnimatePresence>
                      {dateGroup.meetings.map((meeting) => {
                        const isHidden = meeting.userHidden;
                        return (
                          <motion.div
                            key={meeting.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            onClick={() => setActiveMeetingId(meeting.id)}
                            className={`group/row flex items-start gap-3 px-3 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:bg-[var(--sidebar-hover)] cursor-pointer transition-colors ${
                              isHidden ? "opacity-50" : ""
                            }`}
                            style={{ borderLeftWidth: "3px", borderLeftColor: meeting.role.color }}
                          >
                            <div className="shrink-0 w-[64px] pt-0.5">
                              <p className="text-[13px] font-medium text-[var(--text-secondary)] tabular-nums">
                                {formatTime(meeting.startTime)}
                              </p>
                              <p className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                                {formatTime(meeting.endTime)}
                              </p>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                                  {meeting.title}
                                </p>
                                {isHidden && (
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded shrink-0">
                                    hidden
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[12px] text-[var(--text-tertiary)]">
                                <span>{meeting.role.name}</span>
                                {meeting.attendees.length > 0 && (
                                  <span className="inline-flex items-center gap-1 truncate">
                                    <Users className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {meeting.attendees.length <= 3
                                        ? meeting.attendees.join(", ")
                                        : `${meeting.attendees.slice(0, 2).join(", ")} +${meeting.attendees.length - 2}`}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              onClick={(e) => { e.stopPropagation(); deleteMeeting(meeting.id, meeting.title); }}
                              className="shrink-0 self-start p-1.5 rounded opacity-0 group-hover/row:opacity-60 hover:!opacity-100 hover:bg-[var(--surface-sunken)] hover:text-red-400 transition-all text-[var(--text-tertiary)]"
                              aria-label="Hide meeting"
                              title="Hide meeting"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            ))}

            {/* Load more */}
            <div className="flex justify-center py-4">
              {reachedEnd ? (
                <p className="text-[12px] text-[var(--text-tertiary)]">No older meetings</p>
              ) : (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-subtle)] hover:bg-[var(--sidebar-hover)] disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Load older meetings
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {activeMeeting && (
        <MeetingPrepPanel
          meeting={activeMeeting}
          open={true}
          onClose={() => { setActiveMeetingId(null); loadFirst(); }}
        />
      )}
    </AppShell>
  );
}
