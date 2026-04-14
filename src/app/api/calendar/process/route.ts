import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackUsage } from "@/lib/ai-usage";
import { createCompletion } from "@/lib/ai-provider";
import { logSync, type SyncTrigger } from "@/lib/sync-logger";

const DEFAULT_IGNORE_PATTERNS = [
  "OOO", "Out of Office", "Busy", "Deep Work", "Focus Time",
  "Block", "Hold", "No meetings", "Lunch", "Personal",
  "Ironman", "Training", "Swim", "Bike", "Run",
];

async function getIgnorePatterns(): Promise<string[]> {
  const profile = await prisma.userProfile.findUnique({ where: { id: "default" } });
  if (profile?.calendarIgnorePatterns) {
    return profile.calendarIgnorePatterns
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return DEFAULT_IGNORE_PATTERNS;
}

interface CalendarEvent {
  calendarName: string;
  calendarAccount: string;
  title: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  location?: string;
  notes?: string;
}

interface Meeting {
  title: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  isIgnored: boolean;
  roleId: string | null;
  calendarAccount?: string;
  prepTask?: string;
  relevantFollowUps?: string[];
}

interface CalendarResponse {
  date: string;
  meetings: Meeting[];
  conflicts?: string[];
  summary?: string;
}

export async function POST(req: NextRequest) {
  const syncStart = new Date();
  const body = await req.json();
  const { image, events: rawEvents, date, trigger: reqTrigger } = body;
  const trigger: SyncTrigger = reqTrigger || "manual";

  if (!image && !rawEvents) return NextResponse.json({ error: "image or events required" }, { status: 400 });
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const ignorePatterns = await getIgnorePatterns();
  const profile = await prisma.userProfile.findUnique({ where: { id: "default" } });

  const roles = await prisma.role.findMany({
    include: { staff: { select: { name: true, title: true } } },
    orderBy: { priority: "asc" },
  });

  const roleList = roles
    .map((r) => `- ${r.id}: ${r.name} (${r.title}). Staff: ${r.staff.map((s) => s.name).join(", ") || "none"}`)
    .join("\n");

  // Parse calendar account→role mappings (used for EventKit structured data)
  const accountMappings: { account: string; roleId: string; roleName: string }[] = [];
  if (profile?.calendarRoleMappings) {
    for (const line of profile.calendarRoleMappings.split("\n")) {
      const [account, roleName] = line.split("=").map((s) => s.trim());
      if (account && roleName) {
        const role = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
        if (role) accountMappings.push({ account: account.toLowerCase(), roleId: role.id, roleName: role.name });
      }
    }
  }

  const staleFollowUps = await prisma.followUp.findMany({
    where: {
      status: "waiting",
      createdAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    },
    include: { role: { select: { name: true } } },
  });

  const staleContext =
    staleFollowUps.length > 0
      ? `\n\nStale follow-ups (surface these if meeting attendees match):\n${staleFollowUps
          .map(
            (fu) =>
              `- [${fu.role.name}] "${fu.title}" — waiting on ${fu.waitingOn} (${Math.floor((Date.now() - fu.createdAt.getTime()) / 86400000)}d)`
          )
          .join("\n")}`
      : "";

  let parsed: CalendarResponse;

  if (rawEvents) {
    // --- STRUCTURED PATH (EventKit) — no vision AI needed ---
    parsed = await processStructuredEvents(
      rawEvents as CalendarEvent[], date, ignorePatterns, accountMappings, roles, roleList, staleContext
    );
  } else {
    // --- IMAGE PATH (screenshot fallback) — uses vision AI ---
    parsed = await processScreenshot(
      image, date, ignorePatterns, accountMappings, roles, roleList, staleContext
    );
  }

  // --- Reconciliation: 3-phase upsert + remove stale ---
  return await reconcileAndSave(parsed, date, roles, trigger, syncStart);
}

// Process structured events from EventKit — map roles by calendar account, use text AI for prep tasks
async function processStructuredEvents(
  events: CalendarEvent[],
  date: string,
  ignorePatterns: string[],
  accountMappings: { account: string; roleId: string; roleName: string }[],
  roles: { id: string; name: string; title: string; staff: { name: string; title: string }[] }[],
  roleList: string,
  staleContext: string,
): Promise<CalendarResponse> {
  // Map events to meetings with role assignment via calendar account
  const meetings: Meeting[] = [];
  const nonIgnored: { event: CalendarEvent; roleId: string }[] = [];

  for (const event of events) {
    const isIgnored = ignorePatterns.some(
      (p) => event.title.toLowerCase().includes(p.toLowerCase())
    );

    // Map calendar account to role
    let roleId: string | null = null;
    for (const mapping of accountMappings) {
      if (
        event.calendarAccount.toLowerCase().includes(mapping.account) ||
        mapping.account.includes(event.calendarAccount.toLowerCase()) ||
        event.calendarName.toLowerCase().includes(mapping.account) ||
        mapping.account.includes(event.calendarName.toLowerCase())
      ) {
        roleId = mapping.roleId;
        break;
      }
    }
    roleId = roleId || roles[0]?.id;

    const meeting: Meeting = {
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      attendees: event.attendees,
      isIgnored,
      roleId,
      calendarAccount: event.calendarAccount,
    };
    meetings.push(meeting);

    if (!isIgnored) {
      nonIgnored.push({ event, roleId });
    }
  }

  // Use text AI (Haiku — cheap) to generate prep tasks for non-ignored meetings
  if (nonIgnored.length > 0) {
    const meetingList = nonIgnored.map((m) => {
      const parts = [`- ${m.event.startTime}-${m.event.endTime}: ${m.event.title}`];
      if (m.event.attendees?.length) parts.push(`  Attendees: ${m.event.attendees.join(", ")}`);
      if (m.event.notes) parts.push(`  Notes: ${m.event.notes}`);
      return parts.join("\n");
    }).join("\n");

    const response = await createCompletion({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Generate a short prep task for each meeting and identify any scheduling conflicts.

Date: ${date}

Meetings:
${meetingList}

Roles:
${roleList}
${staleContext}

Respond with ONLY valid JSON:
{
  "prepTasks": {
    "HH:MM meeting title": "short actionable prep task"
  },
  "conflicts": ["any scheduling conflicts"],
  "summary": "one sentence summary of the day"
}`,
      }],
    });

    await trackUsage("calendar", response.model, response.usage);

    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const prepData = JSON.parse(jsonMatch[0]);

        // Match prep tasks back to meetings
        for (const meeting of meetings) {
          if (meeting.isIgnored) continue;
          const key = `${meeting.startTime} ${meeting.title}`;
          // Try exact key match, then partial match
          if (prepData.prepTasks?.[key]) {
            meeting.prepTask = prepData.prepTasks[key];
          } else {
            // Fuzzy match by start time
            for (const [k, v] of Object.entries(prepData.prepTasks || {})) {
              if (k.startsWith(meeting.startTime)) {
                meeting.prepTask = v as string;
                break;
              }
            }
          }
        }

        return {
          date,
          meetings,
          conflicts: prepData.conflicts,
          summary: prepData.summary,
        };
      }
    } catch { /* fall through with no prep tasks */ }
  }

  return { date, meetings };
}

// Process screenshot via vision AI (original path, kept as fallback)
async function processScreenshot(
  image: string,
  date: string,
  ignorePatterns: string[],
  accountMappings: { account: string; roleId: string; roleName: string }[],
  roles: { id: string; name: string; title: string; staff: { name: string; title: string }[] }[],
  roleList: string,
  staleContext: string,
): Promise<CalendarResponse> {
  const mappingInstructions = accountMappings.length > 0
    ? `\n\nUse these color-to-role mappings to determine roleId:\n${accountMappings.map((m) => `- "${m.account}" events → roleId: "${m.roleId}" (${m.roleName})`).join("\n")}`
    : "";

  const response = await createCompletion({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: image },
          },
          {
            type: "text",
            text: `Analyze this calendar screenshot for ${date}. Extract all meetings/events visible.

For each meeting, provide:
- title: the meeting name exactly as shown
- startTime: in HH:MM format (24hr)
- endTime: in HH:MM format (24hr)
- attendees: any visible attendee names (may not be visible)
- isIgnored: true if the meeting matches any of these ignore patterns (case insensitive): ${ignorePatterns.join(", ")}

IGNORE these types of events completely — do not create tasks for them:
${ignorePatterns.map((p) => `- ${p}`).join("\n")}

For each NON-ignored meeting, determine:
- roleId: which role this meeting belongs to.
${mappingInstructions}

  Available roles:
${roleList}
  If you can't determine the role, set roleId to null.

- prepTask: a short, actionable prep task for this meeting

- relevantFollowUps: if any of these stale follow-ups involve people who might be in the meeting, list them:
${staleContext}

Respond with ONLY valid JSON, no markdown backticks:
{
  "date": "${date}",
  "meetings": [
    {
      "title": "string",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "attendees": ["name1", "name2"],
      "isIgnored": false,
      "roleId": "string or null",
      "prepTask": "string",
      "relevantFollowUps": ["string"]
    }
  ],
  "conflicts": ["any scheduling conflicts with the standard time blocks"],
  "summary": "one sentence summary of the day"
}`,
          },
        ],
      },
    ],
  });

  await trackUsage("calendar", response.model, response.usage);

  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON object found in AI response");
  return JSON.parse(jsonMatch[0]);
}

// Reconcile parsed meetings with DB and save
async function reconcileAndSave(
  parsed: CalendarResponse,
  date: string,
  roles: { id: string }[],
  trigger: SyncTrigger,
  syncStart: Date,
) {
  function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  }

  function buildSourceId(meeting: Meeting, date: string): string {
    // Include calendar account to avoid collisions when same title appears on multiple calendars
    const acct = meeting.calendarAccount ? normalize(meeting.calendarAccount).slice(0, 20) + "-" : "";
    return `cal-${date}-${acct}${normalize(meeting.title)}`;
  }

  // Phase 1: Build maps
  const existingMeetings = await prisma.meeting.findMany({
    where: { date },
    include: { prepTask: { select: { id: true, done: true } } },
  });
  const existingBySourceId = new Map(existingMeetings.map((m) => [m.sourceId, m]));

  const parsedSourceIds = new Set<string>();
  const createdTasks: { id: string }[] = [];
  const createdMeetings: { id: string }[] = [];
  const updatedMeetings: { id: string }[] = [];

  // Phase 2: Upsert meetings
  for (const meeting of parsed.meetings) {
    const sourceId = buildSourceId(meeting, date);
    parsedSourceIds.add(sourceId);
    const roleId = meeting.roleId || roles[0]?.id;
    const existing = existingBySourceId.get(sourceId);

    if (existing) {
      const changes: Record<string, unknown> = {};
      if (existing.startTime !== meeting.startTime) changes.startTime = meeting.startTime;
      if (existing.endTime !== meeting.endTime) changes.endTime = meeting.endTime;
      if (existing.roleId !== roleId) changes.roleId = roleId;
      if (existing.isIgnored !== (meeting.isIgnored || false)) changes.isIgnored = meeting.isIgnored || false;
      if (JSON.stringify(existing.attendees) !== JSON.stringify(meeting.attendees || [])) changes.attendees = meeting.attendees || [];

      if (Object.keys(changes).length > 0) {
        await prisma.meeting.update({ where: { id: existing.id }, data: changes });
        if (changes.startTime && existing.prepTask && !existing.prepTask.done) {
          const oldPrefix = `${existing.startTime} — `;
          const linkedTask = await prisma.task.findUnique({ where: { id: existing.prepTask.id } });
          if (linkedTask?.title.startsWith(oldPrefix)) {
            await prisma.task.update({
              where: { id: linkedTask.id },
              data: { title: linkedTask.title.replace(oldPrefix, `${meeting.startTime} — `) },
            });
          }
        }
        updatedMeetings.push({ id: existing.id });
      }
    } else {
      let prepTaskId: string | null = null;
      if (!meeting.isIgnored && meeting.prepTask) {
        const task = await prisma.task.create({
          data: {
            roleId,
            title: `${meeting.startTime} — ${meeting.prepTask}`,
            priority: "normal",
            status: "backlog",
            isToday: true,
            sourceType: "calendar",
            sourceId,
            notes: [
              `Meeting: ${meeting.title}`,
              meeting.attendees?.length ? `Attendees: ${meeting.attendees.join(", ")}` : null,
              meeting.relevantFollowUps?.length
                ? `\nBring up:\n${meeting.relevantFollowUps.map((f: string) => `- ${f}`).join("\n")}`
                : null,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        });
        prepTaskId = task.id;
        createdTasks.push(task);
      }

      const meetingRecord = await prisma.meeting.create({
        data: {
          roleId,
          title: meeting.title,
          date,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          attendees: meeting.attendees || [],
          isIgnored: meeting.isIgnored || false,
          prepTaskId,
          followUpNotes: meeting.relevantFollowUps?.length
            ? meeting.relevantFollowUps.join("\n")
            : null,
          sourceId,
        },
      });
      createdMeetings.push(meetingRecord);
    }
  }

  // Phase 3: Remove stale meetings
  const now = new Date();
  const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const removedMeetings: { id: string }[] = [];

  for (const existing of existingMeetings) {
    if (parsedSourceIds.has(existing.sourceId)) continue;
    if (existing.endTime <= currentTimeStr) continue;

    if (existing.prepTask && !existing.prepTask.done) {
      await prisma.task.delete({ where: { id: existing.prepTask.id } });
    }
    await prisma.meeting.delete({ where: { id: existing.id } });
    removedMeetings.push({ id: existing.id });
  }

  // Store calendar summary as a note (only on first sync of the day)
  if (parsed.meetings.length > 0) {
    const existingNote = await prisma.note.findFirst({
      where: { tags: { hasSome: ["calendar", date] } },
    });

    if (!existingNote) {
      const noteContent = [
        `Calendar for ${date}:`,
        parsed.summary,
        "",
        ...parsed.meetings.map(
          (m) => `${m.isIgnored ? "[IGNORED] " : ""}${m.startTime}-${m.endTime}: ${m.title}`
        ),
        "",
        parsed.conflicts?.length ? `Conflicts: ${parsed.conflicts.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const primaryRole =
        parsed.meetings.find((m) => !m.isIgnored && m.roleId)?.roleId || roles[0]?.id;

      await prisma.note.create({
        data: {
          roleId: primaryRole,
          content: noteContent,
          tags: ["calendar", date],
        },
      });
    }
  }

  const meetingsIgnored = parsed.meetings.filter((m) => m.isIgnored).length;

  await logSync({
    type: "calendar",
    trigger,
    status: "success",
    summary: `${parsed.meetings.length} found, ${createdMeetings.length} created, ${updatedMeetings.length} updated, ${removedMeetings.length} removed`,
    itemsFound: parsed.meetings.length,
    itemsCreated: createdMeetings.length,
    itemsUpdated: updatedMeetings.length,
    itemsSkipped: meetingsIgnored,
    startedAt: syncStart,
    meta: { date, conflicts: parsed.conflicts, removed: removedMeetings.length },
  }).catch(() => {});

  return NextResponse.json({
    date: parsed.date || date,
    meetingsFound: parsed.meetings.length,
    meetingsCreated: createdMeetings.length,
    meetingsUpdated: updatedMeetings.length,
    meetingsRemoved: removedMeetings.length,
    meetingsIgnored,
    tasksCreated: createdTasks.length,
    conflicts: parsed.conflicts,
    summary: parsed.summary,
  });
}
