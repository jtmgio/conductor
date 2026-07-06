import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletionWithLocalFallback, getDefaultTextModel } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rawText, roleId } = await req.json();
  if (!rawText?.trim()) return NextResponse.json({ error: "rawText required" }, { status: 400 });

  const [role, existingTasks] = await Promise.all([
    roleId ? prisma.role.findUnique({ where: { id: roleId }, select: { name: true, responsibilities: true } }) : null,
    prisma.task.findMany({
      where: { roleId: roleId || undefined, done: false, status: { not: "icebox" } },
      select: { title: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const existingList = existingTasks.map((t) => `- ${t.title}`).join("\n");

  const today = new Date().toISOString().split("T")[0];
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const prompt = `Parse this brain dump into a structured task card.

TODAY: ${dayName}, ${today}
INPUT: "${rawText}"
${role ? `ROLE: ${role.name}` : ""}
${existingList ? `\nEXISTING TASKS (avoid duplicates):\n${existingList}` : ""}

Return JSON:
{
  "title": "SHORT title — 5-10 words max, imperative verb, like a Kanban card",
  "notes": "All the details, context, and constraints from the input go here. This is the description.",
  "checklist": [{"text": "step 1", "done": false}] or null,
  "priority": "urgent" or "normal",
  "dueDate": "YYYY-MM-DD" or null
}

CRITICAL RULES:
1. The title MUST be short. Maximum 10 words. Examples of good titles:
   - "Verify staging onboarding for all org states"
   - "Fix deprecated CareNav route redirects"
   - "Audit Coastal org dashboard redirect"
   NEVER use the full input as the title.
2. Everything the title leaves out goes into notes — context, names, edge cases, details
3. If there are multiple distinct actions, make a checklist (2-5 items)
4. If input mentions ANY deadline or time reference, extract dueDate as YYYY-MM-DD.
   Resolve relative dates using TODAY above: "next Thursday", "by Friday", "end of month",
   "this week", "next week", "before Wednesday" — all become concrete dates.
5. Only "urgent" if explicitly time-sensitive or blocking
6. Return ONLY the JSON object, no markdown fences`;

  try {
    const result = await createCompletionWithLocalFallback({
      model: getDefaultTextModel(),
      system: "You are a task parser. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    });

    await trackUsage("task-refine", result.model, result.usage, roleId || undefined);

    let text = result.text.trim();
    // Strip markdown code fences if present
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    const refined = JSON.parse(text);

    return NextResponse.json({ refined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
