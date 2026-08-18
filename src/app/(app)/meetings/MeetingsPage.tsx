"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Calendar,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Paperclip,
  Search,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface Meeting {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  followUpNotes: string | null;
  aiPrepContent: string | null;
  meetingNoteId: string | null;
  transcriptId: string | null;
  roleId: string;
  role: { id: string; name: string; color: string };
  prepTask: { id: string; title: string; done: boolean } | null;
}

interface MeetingDetail extends Meeting {
  transcript: {
    id: string;
    title: string;
    rawText: string | null;
    summary: string | null;
    processedAt: string | null;
  } | null;
}

interface MeetingFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface Role {
  id: string;
  name: string;
  color: string;
}

// How far forward the calendar sync reaches (CALENDAR_WINDOW_DAYS default is 14).
const FORWARD_DAYS = 15;
const PAGE_DAYS = 45;

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDay(dateStr: string): string {
  const today = todayLocal();
  if (dateStr === today) return "Today";
  if (dateStr === addDays(today, 1)) return "Tomorrow";
  if (dateStr === addDays(today, -1)) return "Yesterday";
  const d = new Date(dateStr + "T00:00:00");
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((d) => setRoles(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const buildUrl = useCallback(
    (before: string, days: number) => {
      const params = new URLSearchParams({
        history: "1",
        before,
        days: String(days),
      });
      if (roleFilter !== "all") params.set("roleId", roleFilter);
      if (debouncedQuery) params.set("q", debouncedQuery);
      return `/api/meetings?${params.toString()}`;
    },
    [roleFilter, debouncedQuery]
  );

  // Initial load + reload whenever the filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setExhausted(false);
    setExpandedId(null);
    const before = addDays(todayLocal(), FORWARD_DAYS);
    fetch(buildUrl(before, PAGE_DAYS))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data) => {
        if (cancelled) return;
        setMeetings(Array.isArray(data.meetings) ? data.meetings : []);
        setNextBefore(data.nextBefore ?? null);
      })
      .catch(() => {
        if (!cancelled) toast("Couldn't load meetings", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildUrl, toast]);

  // An empty window doesn't mean there's nothing older — a quiet month, or a role
  // with a gap in its history, would otherwise look like the end of the archive.
  // So keep walking back until something turns up or we've cleared EMPTY_LIMIT
  // consecutive windows.
  const loadEarlier = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    const EMPTY_LIMIT = 4;
    let cursor: string | null = nextBefore;
    try {
      for (let empties = 0; empties < EMPTY_LIMIT && cursor; ) {
        const res: Response = await fetch(buildUrl(cursor, PAGE_DAYS));
        if (!res.ok) throw new Error("load failed");
        const data: { meetings?: Meeting[]; nextBefore?: string | null } = await res.json();
        const older: Meeting[] = Array.isArray(data.meetings) ? data.meetings : [];
        cursor = data.nextBefore ?? null;
        setNextBefore(cursor);
        if (older.length > 0) {
          setMeetings((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...older.filter((m) => !seen.has(m.id))];
          });
          break;
        }
        empties += 1;
        if (empties >= EMPTY_LIMIT) setExhausted(true);
      }
    } catch {
      toast("Couldn't load earlier meetings", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const today = todayLocal();
  const byTime = (a: Meeting, b: Meeting) => a.startTime.localeCompare(b.startTime);
  // Today first, then forward, then back — the order you'd actually read them in.
  const todays = meetings.filter((m) => m.date === today).sort(byTime);
  const upcoming = meetings
    .filter((m) => m.date > today)
    .sort((a, b) => (a.date === b.date ? byTime(a, b) : a.date.localeCompare(b.date)));
  const earlier = meetings
    .filter((m) => m.date < today)
    .sort((a, b) => (a.date === b.date ? byTime(a, b) : b.date.localeCompare(a.date)));

  const sections = [
    { key: "today", label: "Today", items: todays },
    { key: "upcoming", label: "Coming up", items: upcoming },
    { key: "earlier", label: "Earlier", items: earlier },
  ].filter((s) => s.items.length > 0);

  return (
    <>
      <div className="mx-auto max-w-3xl pt-1">
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--text-primary)]">Meetings</h1>
        <p className="mt-1 text-[14px] text-[var(--text-tertiary)]">
          Everything your calendar synced — prep, notes, and transcripts in one place.
        </p>

        {/* Search */}
        <div className="relative mt-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meeting titles…"
            className="w-full min-h-[44px] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] pl-10 pr-10 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--border-strong)]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Role filter */}
        <div className="mt-3 mb-7 flex gap-2 overflow-x-auto hide-scrollbar py-1">
          <button
            onClick={() => setRoleFilter("all")}
            className={cn(
              "min-h-[36px] px-3.5 rounded-xl text-[13px] font-medium whitespace-nowrap transition-colors shrink-0 border",
              roleFilter === "all"
                ? "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            )}
          >
            All
          </button>
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setRoleFilter(role.id)}
              className={cn(
                "min-h-[36px] px-3.5 rounded-xl text-[13px] font-medium whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5 border",
                roleFilter === role.id
                  ? "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
              {role.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="py-16 text-center">
            <Calendar className="mx-auto h-6 w-6 text-[var(--text-tertiary)] opacity-50" />
            <p className="mt-3 text-[14px] text-[var(--text-tertiary)]">
              {debouncedQuery || roleFilter !== "all"
                ? "No meetings match that."
                : "Nothing on the calendar in this window."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {sections.map((section) => (
              <div key={section.key}>
                <h2 className="mb-3 text-[12px] uppercase tracking-wider font-medium text-[var(--text-tertiary)]">
                  {section.label}
                </h2>
                <div className="flex flex-col gap-5">
                  {groupByDate(section.items).map(({ date, items }) => (
                    <div key={date}>
                      {/* The "Today" section header already names the day. */}
                      {section.key !== "today" && (
                        <div className="mb-1.5 text-[13px] font-medium text-[var(--text-secondary)]">
                          {formatDay(date)}
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5">
                        {items.map((m) => (
                          <MeetingRow
                            key={m.id}
                            meeting={m}
                            expanded={expandedId === m.id}
                            onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Paging */}
            <div className="pb-10 flex justify-center">
              {exhausted || !nextBefore ? (
                <p className="text-[13px] text-[var(--text-tertiary)]">Nothing further back.</p>
              ) : (
                <button
                  onClick={loadEarlier}
                  disabled={loadingMore}
                  className="min-h-[44px] px-5 rounded-xl border border-[var(--border-subtle)] text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  Load earlier meetings
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function groupByDate(items: Meeting[]): Array<{ date: string; items: Meeting[] }> {
  const groups: Array<{ date: string; items: Meeting[] }> = [];
  for (const m of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === m.date) last.items.push(m);
    else groups.push({ date: m.date, items: [m] });
  }
  return groups;
}

function MeetingRow({
  meeting,
  expanded,
  onToggle,
}: {
  meeting: Meeting;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [files, setFiles] = useState<MeetingFile[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!expanded || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/meetings/${meeting.id}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/meetings/${meeting.id}/files`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([d, f]) => {
        setDetail(d);
        setFiles(Array.isArray(f) ? f : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expanded, meeting.id]);

  const hasPrep = Boolean(meeting.aiPrepContent);
  const hasTranscript = Boolean(meeting.transcriptId);
  const attendeeCount = meeting.attendees?.length || 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--surface-raised)] transition-colors",
        expanded ? "border-[var(--border-strong)]" : "border-[var(--border-subtle)]"
      )}
    >
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start gap-3 px-4 py-3 min-h-[44px] hover:bg-[var(--sidebar-hover)] rounded-xl transition-colors"
      >
        <div className="flex flex-col items-end shrink-0 w-[70px] pt-0.5">
          <span className="text-[13px] font-medium text-[var(--text-secondary)] tabular-nums">
            {formatTime(meeting.startTime)}
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
            {formatTime(meeting.endTime)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: meeting.role.color }}
            />
            <span className="text-[14.5px] font-medium text-[var(--text-primary)] leading-snug truncate">
              {meeting.title}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[12px] text-[var(--text-tertiary)]">
            <span>{meeting.role.name}</span>
            {attendeeCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {attendeeCount}
              </span>
            )}
            {hasPrep && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" />
                prep
              </span>
            )}
            {hasTranscript && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" />
                transcript
              </span>
            )}
            {meeting.prepTask?.done && (
              <span className="inline-flex items-center gap-1 text-emerald-500">
                <Check className="h-3 w-3" />
                prepped
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 mt-1 text-[var(--text-tertiary)] transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-[var(--border-subtle)] mt-1 flex flex-col gap-4">
              {loading && (
                <div className="pt-3 flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              )}

              {attendeeCount > 0 && (
                <Section title="Attendees">
                  <p className="text-[13.5px] text-[var(--text-secondary)] leading-relaxed">
                    {meeting.attendees.join(", ")}
                  </p>
                </Section>
              )}

              {meeting.prepTask && (
                <Section title="Prep task">
                  <p
                    className={cn(
                      "text-[13.5px]",
                      meeting.prepTask.done
                        ? "text-[var(--text-tertiary)] line-through"
                        : "text-[var(--text-secondary)]"
                    )}
                  >
                    {meeting.prepTask.title.replace(/^\d{1,2}:\d{2}\s*[—–-]\s*/, "")}
                  </p>
                </Section>
              )}

              {meeting.followUpNotes && (
                <Section title="Bring up">
                  <p className="text-[13.5px] text-amber-400/90 whitespace-pre-wrap leading-relaxed">
                    {meeting.followUpNotes}
                  </p>
                </Section>
              )}

              {meeting.aiPrepContent && (
                <Section title="Prep notes">
                  <Markdown>{meeting.aiPrepContent}</Markdown>
                </Section>
              )}

              {detail?.transcript?.summary && (
                <Section title="Transcript summary">
                  <Markdown>{detail.transcript.summary}</Markdown>
                </Section>
              )}

              {detail?.transcript?.rawText && (
                <details className="group">
                  <summary className="cursor-pointer text-[12px] uppercase tracking-wider font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors list-none">
                    Full transcript
                  </summary>
                  <pre className="mt-2 max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-sunken)] border border-[var(--border-subtle)] p-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)] font-sans">
                    {detail.transcript.rawText}
                  </pre>
                </details>
              )}

              {files.length > 0 && (
                <Section title="Files">
                  <ul className="flex flex-col gap-1">
                    {files.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center gap-2 text-[13.5px] text-[var(--text-secondary)]"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                        <span className="truncate">{f.filename}</span>
                        <span className="text-[12px] text-[var(--text-tertiary)] shrink-0">
                          {formatSize(f.size)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {!loading &&
                !meeting.aiPrepContent &&
                !meeting.followUpNotes &&
                !meeting.prepTask &&
                attendeeCount === 0 &&
                !detail?.transcript &&
                files.length === 0 && (
                  <p className="pt-3 text-[13px] text-[var(--text-tertiary)]">
                    Nothing captured for this one — just the calendar entry.
                  </p>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] uppercase tracking-wider font-medium text-[var(--text-tertiary)]">
        {title}
      </p>
      {children}
    </div>
  );
}

function Markdown({ children }: { children: string }) {
  return (
    <div
      className="prose prose-invert prose-sm max-w-none
        prose-p:text-[var(--text-secondary)] prose-p:text-[13.5px] prose-p:leading-relaxed prose-p:my-1.5
        prose-a:text-[var(--accent-blue)] prose-a:no-underline hover:prose-a:underline
        prose-headings:text-[var(--text-primary)] prose-headings:font-semibold
        prose-strong:text-[var(--text-primary)]
        prose-code:text-[var(--accent-blue)] prose-code:bg-[var(--surface)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[12.5px]
        prose-li:text-[var(--text-secondary)] prose-li:text-[13.5px]
        prose-ul:my-1.5 prose-ol:my-1.5"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {c}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
