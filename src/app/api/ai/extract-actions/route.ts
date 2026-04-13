import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, roleId } = await req.json();
  if (!text || !roleId) {
    return NextResponse.json({ error: "text and roleId required" }, { status: 400 });
  }

  const response = await createCompletion({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: "Extract actionable tasks and follow-ups from this AI assistant response. Only include concrete, specific action items. Return JSON only.",
    messages: [
      {
        role: "user",
        content: `Extract action items from the following text. Return a JSON object with two arrays:
- "tasks": each with "title" (string) and "priority" ("normal", "high", or "urgent")
- "followUps": each with "title" (string) and "waitingOn" (string — who or what you're waiting on)

Only include concrete, specific items. If there are no action items, return empty arrays.

Text:
${text}`,
      },
    ],
  });

  trackUsage("extract_actions", response.model, response.usage, roleId);

  try {
    const cleaned = response.text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json({
      tasks: parsed.tasks || [],
      followUps: parsed.followUps || [],
    });
  } catch {
    return NextResponse.json({ tasks: [], followUps: [] });
  }
}
