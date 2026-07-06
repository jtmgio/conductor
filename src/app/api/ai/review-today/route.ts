import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletionWithLocalFallback } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";
import { getScheduleBlocks } from "@/lib/schedule";
import { today, parseDateOnly } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * Reviews a candidate task list against the schedule for a target date and
 * returns a verdict (realistic/ambitious/overloaded) plus per-task assessment.
 *
 * Body (all optional):
 *   targetDate: YYYY-MM-DD — defaults to today. Hours computed from that day's blocks.
 *   candidateTaskIds: string[] — tasks to evaluate. Defaults to all tasks
 *     scheduledFor <= targetDate (i.e., today's actual list).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { targetDate?: string; candidateTaskIds?: string[] } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {}

  const target = parseDateOnly(body.targetDate) ?? today();
  const isToday = target.getTime() === today().getTime();

  const tasks = body.candidateTaskIds && body.candidateTaskIds.length > 0
    ? await prisma.task.findMany({
        where: { id: { in: body.candidateTaskIds }, done: false, status: { not: "icebox" } },
        include: { role: { select: { id: true, name: true, color: true } } },
        orderBy: [{ role: { priority: "asc" } }, { sortOrder: "asc" }],
      })
    : await prisma.task.findMany({
        where: { scheduledFor: { lte: target }, done: false, status: { not: "icebox" } },
        include: { role: { select: { id: true, name: true, color: true } } },
        orderBy: [{ role: { priority: "asc" } }, { sortOrder: "asc" }],
      });

  if (tasks.length === 0) {
    return NextResponse.json({ review: null, message: "No tasks to review" });
  }

  // Hours available on the target day. For today, count remaining; for any
  // other day, count the full day.
  const blocks = await getScheduleBlocks();
  const dayOfWeek = target.getUTCDay();
  const now = new Date();
  const localStr = now.toLocaleString("en-US", { timeZone: process.env.TIMEZONE || "America/New_York" });
  const localNow = new Date(localStr);
  const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();

  let totalMinutes = 0;
  for (const block of blocks) {
    const roleId = block.dayAssignments[String(dayOfWeek)];
    if (!roleId) continue;
    const start = block.startHour * 60 + block.startMinute;
    const end = block.endHour * 60 + block.endMinute;
    if (isToday) {
      if (end > currentMinutes) totalMinutes += end - Math.max(start, currentMinutes);
    } else {
      totalMinutes += end - start;
    }
  }
  const hoursAvailable = Math.round(totalMinutes / 60 * 10) / 10;

  const dayLabel = isToday
    ? "today"
    : target.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

  const taskList = tasks.map((t, i) =>
    `${i + 1}. [${t.role?.name || "No role"}] ${t.title}${t.priority === "urgent" ? " [URGENT]" : ""}${t.notes ? `\n   Notes: ${t.notes.slice(0, 200)}` : ""}`
  ).join("\n");

  const prompt = `You are a realistic productivity coach. Review this person's task list for ${dayLabel} and give honest, practical feedback.

**Available time on ${dayLabel}:** ~${hoursAvailable} hours across ${blocks.length} time blocks.

**Tasks (${tasks.length}):**
${taskList}

Respond with a JSON object:
{
  "verdict": "realistic" | "ambitious" | "overloaded",
  "summary": "1-2 sentence overall assessment",
  "tasks": [
    {
      "index": 1,
      "title": "task title",
      "assessment": "doable" | "too_big" | "vague" | "ok",
      "suggestion": "optional — only if too_big or vague, suggest how to break it down or clarify",
      "estimatedMinutes": 30
    }
  ],
  "totalEstimatedMinutes": 240,
  "recommendation": "optional 1-2 sentence recommendation if overloaded — which tasks to defer"
}

Rules:
- Be blunt but not mean. This person is neurodivergent and vague tasks cause paralysis.
- "too_big" = cannot reasonably be completed in one focused session (>2 hours)
- "vague" = unclear what "done" looks like — needs a concrete definition
- Time estimates should be realistic, not optimistic
- If overloaded, suggest specific tasks to move to backlog or icebox — don't just say "prioritize"
- Only return the JSON, no markdown fences`;

  try {
    const result = await createCompletionWithLocalFallback({
      model: "claude-haiku-4-5-20251001",
      system: "You are a productivity coach. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    });

    await trackUsage("review-today", "claude-haiku-4-5-20251001", result.usage);

    const text = result.text.trim();
    const review = JSON.parse(text);

    return NextResponse.json({
      review,
      hoursAvailable,
      hoursRemaining: hoursAvailable, // backwards-compat alias
      taskCount: tasks.length,
      targetDate: target.toISOString().slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
