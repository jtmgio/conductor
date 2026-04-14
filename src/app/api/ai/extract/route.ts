import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assembleContext } from "@/lib/ai-context";
import { createCompletion, type AIContentBlock } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roleId, content, contentType, base64, mimeType } = await req.json();
  if (!roleId || (!content && !base64)) {
    return NextResponse.json({ error: "roleId and content or base64 required" }, { status: 400 });
  }

  const { systemPrompt, contextMessages } = await assembleContext({ roleId });

  const extractPrompt = `Analyze the following ${contentType || "content"} and extract structured data.

Return a JSON object with these arrays (each can be empty):
- tasks: [{title: string, priority: "normal"|"urgent"}]
- followUps: [{title: string, waitingOn: string}]
- decisions: [{summary: string}]
- keyQuotes: [{text: string, speaker?: string}]
- autoFollowUps: [{title: string, waitingOn: string, deadline?: string}]

For autoFollowUps, detect any commitments or promises made by others (e.g., "I'll send that by Friday", "Ryan will share the schema", "Let me get back to you on that"). List the person's name as waitingOn and include a deadline if one was mentioned.

Only include items that are clearly present. Be concise in titles.`;

  // Build message content — support both text and images
  const userContent: AIContentBlock[] = [];

  if (base64 && mimeType?.startsWith("image/")) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: mimeType, data: base64 },
    });
    userContent.push({
      type: "text",
      text: `${extractPrompt}\n\nAnalyze the image above (a screenshot) and extract any tasks, follow-ups, decisions, or key quotes visible in it.`,
    });
  } else {
    userContent.push({
      type: "text",
      text: `${extractPrompt}\n\nContent to analyze:\n${content}`,
    });
  }

  const response = await createCompletion({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `${systemPrompt}\n\nContext:\n${contextMessages}\n\nYou must respond with valid JSON only, no markdown fences.`,
    messages: [{ role: "user", content: userContent }],
  });

  trackUsage("extract", response.model, response.usage, roleId);

  try {
    // Strip markdown fences first
    let cleaned = response.text.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
    // If there's extra text around the JSON, extract the outermost { ... }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    const extracted = JSON.parse(cleaned);
    return NextResponse.json(extracted);
  } catch {
    return NextResponse.json({
      tasks: [],
      followUps: [],
      decisions: [{ summary: response.text }],
      keyQuotes: [],
      autoFollowUps: [],
    });
  }
}
