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

// Role keywords built dynamically from role names, context, and staff
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function buildRoleKeywords(): Promise<Record<string, string[]>> {
  const roles = await prisma.role.findMany({
    where: { active: true },
    include: { staff: { select: { name: true } } },
  });
  const keywords: Record<string, string[]> = {};
  for (const role of roles) {
    const kw = [role.name.toLowerCase()];
    if (role.context) {
      role.context.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3).slice(0, 5).forEach(w => kw.push(w));
    }
    for (const s of role.staff) {
      const firstName = s.name.split(" ")[0].toLowerCase();
      if (firstName.length > 2) kw.push(firstName + " ");
    }
    keywords[role.id] = kw;
  }
  return keywords;
}

interface Meeting {
  title: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  isIgnored: boolean;
  roleId: string | null;
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
  const { image, date, trigger: reqTrigger } = await req.json();
  const trigger: SyncTrigger = reqTrigger || "manual";
  if (!image) return NextResponse.json({ error: "image required" }, { status: 400 });
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const ignorePatterns = await getIgnorePatterns();

  const roles = await prisma.role.findMany({
    include: { staff: { select: { name: true, title: true } } },
    orderBy: { priority: "asc" },
  });

  const roleList = roles
    .map((r) => `- ${r.id}: ${r.name} (${r.title}). Staff: ${r.staff.map((s) => s.name).join(", ") || "none"}`)
    .join("\n");

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
- roleId: which role this meeting belongs to, based on these roles:
${roleList}
  If you can't determine the role from the title, set roleId to null.

- prepTask: a short, actionable prep task for this meeting (e.g., "Review PR list before standup", "Prep status update for leadership")

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

  let parsed: CalendarResponse;
  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found");
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw: response.text }, { status: 500 });
  }

  const createdTasks = [];
  for (const meeting of parsed.meetings) {
    if (meeting.isIgnored) continue;
    if (!meeting.prepTask) continue;

    const sourceId = `cal-${date}-${meeting.startTime}`;

    const existing = await prisma.task.findFirst({
      where: { sourceType: "calendar", sourceId },
    });
    if (existing) continue;

    const roleId = meeting.roleId || roles[0]?.id;

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
    createdTasks.push(task);
  }

  // Store calendar summary as a note
  if (parsed.meetings.length > 0) {
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

  const meetingsIgnored = parsed.meetings.filter((m) => m.isIgnored).length;

  await logSync({
    type: "calendar",
    trigger,
    status: "success",
    summary: parsed.summary || `${parsed.meetings.length} meetings, ${createdTasks.length} tasks created`,
    itemsFound: parsed.meetings.length,
    itemsCreated: createdTasks.length,
    itemsSkipped: meetingsIgnored,
    startedAt: syncStart,
    meta: { date, conflicts: parsed.conflicts },
  }).catch(() => {});

  return NextResponse.json({
    date: parsed.date,
    meetingsFound: parsed.meetings.length,
    meetingsIgnored,
    tasksCreated: createdTasks.length,
    conflicts: parsed.conflicts,
    summary: parsed.summary,
  });
}
