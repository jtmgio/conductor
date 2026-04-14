import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, roleId } = await req.json();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  // Gather context: existing tasks for this role + role info
  const [role, existingTasks] = await Promise.all([
    roleId ? prisma.role.findUnique({ where: { id: roleId }, select: { name: true, responsibilities: true } }) : null,
    prisma.task.findMany({
      where: { roleId: roleId || undefined, done: false },
      select: { title: true, priority: true, status: true, notes: true },
      take: 30,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const existingList = existingTasks.map((t) => `- ${t.title}${t.priority === "urgent" ? " [URGENT]" : ""}`).join("\n");

  const prompt = `You are a productivity assistant. A user just created a task. Review it and provide brief, actionable suggestions.

Task: "${title}"
${role ? `Role: ${role.name}` : ""}
${role?.responsibilities ? `Role responsibilities: ${role.responsibilities}` : ""}

Existing tasks for this role:
${existingList || "(none)"}

Respond with a JSON object. Only include fields where you have a genuine suggestion — omit fields where the task is already fine.

{
  "subtasks": ["step 1", "step 2"],     // Only if the task is clearly multi-step and would benefit from a checklist (2-4 items max)
  "priority": "urgent",                  // Only if this sounds time-sensitive or blocking
  "duplicate": "existing task title",    // Only if there's a very similar existing task
  "clarify": "brief question",           // Only if the task is vague and would benefit from more detail
  "rewrite": "improved task title"       // Only if the title could be more specific/actionable
}

Rules:
- Be conservative. Most tasks are fine as-is — return {} if nothing stands out.
- Never suggest more than 2 fields at once.
- Keep subtasks to 2-4 items, not granular steps.
- "clarify" should be a single short question.
- "rewrite" should preserve the intent but make it more actionable.
- Only flag "duplicate" for very close matches, not vaguely related tasks.`;

  try {
    const response = await createCompletion({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: "You are a concise productivity assistant. Respond only with valid JSON, no markdown fencing.",
      messages: [{ role: "user", content: prompt }],
    });

    trackUsage("task-suggest", response.model, response.usage, roleId || undefined);

    // Parse the JSON response
    const text = response.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ suggestions: {} });

    const suggestions = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: {} });
  }
}
