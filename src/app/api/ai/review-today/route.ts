import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";
import { getScheduleBlocks } from "@/lib/schedule";
import { today } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get today's tasks
  const todayTasks = await prisma.task.findMany({
    where: { scheduledFor: { lte: today() }, done: false, status: { not: "icebox" } },
    include: {
      role: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ role: { priority: "asc" } }, { sortOrder: "asc" }],
  });

  if (todayTasks.length === 0) {
    return NextResponse.json({ review: null, message: "No tasks selected for today" });
  }

  // Get schedule blocks to estimate available hours
  const blocks = await getScheduleBlocks();
  const now = new Date();
  const localStr = now.toLocaleString("en-US", { timeZone: process.env.TIMEZONE || "America/New_York" });
  const localNow = new Date(localStr);
  const dayOfWeek = localNow.getDay();
  const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();

  let totalMinutesRemaining = 0;
  for (const block of blocks) {
    const roleId = block.dayAssignments[String(dayOfWeek)];
    if (!roleId) continue;
    const start = block.startHour * 60 + block.startMinute;
    const end = block.endHour * 60 + block.endMinute;
    if (end > currentMinutes) {
      totalMinutesRemaining += end - Math.max(start, currentMinutes);
    }
  }

  const hoursRemaining = Math.round(totalMinutesRemaining / 60 * 10) / 10;

  const taskList = todayTasks.map((t, i) =>
    `${i + 1}. [${t.role?.name || "No role"}] ${t.title}${t.priority === "urgent" ? " [URGENT]" : ""}${t.notes ? `\n   Notes: ${t.notes.slice(0, 200)}` : ""}`
  ).join("\n");

  const prompt = `You are a realistic productivity coach. Review this person's task list for today and give honest, practical feedback.

**Available time remaining today:** ~${hoursRemaining} hours across ${blocks.length} time blocks.

**Today's tasks (${todayTasks.length}):**
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
    const result = await createCompletion({
      model: "claude-haiku-4-5-20251001",
      system: "You are a productivity coach. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    });

    await trackUsage("review-today", "claude-haiku-4-5-20251001", result.usage);

    const text = result.text.trim();
    const review = JSON.parse(text);

    return NextResponse.json({ review, hoursRemaining, taskCount: todayTasks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
