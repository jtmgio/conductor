import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assembleContext } from "@/lib/ai-context";
import Anthropic from "@anthropic-ai/sdk";
import { trackUsage } from "@/lib/ai-usage";
import { getAnthropicApiKey } from "@/lib/api-keys";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = await getAnthropicApiKey();
  const anthropic = new Anthropic({ apiKey });

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

Only include items that are clearly present. Be concise in titles.`;

  // Build message content — support both text and images
  const userContent: Anthropic.ContentBlockParam[] = [];

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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `${systemPrompt}\n\nContext:\n${contextMessages}\n\nYou must respond with valid JSON only, no markdown fences.`,
    messages: [{ role: "user", content: userContent }],
  });

  trackUsage("extract", response.model, response.usage, roleId);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const extracted = JSON.parse(text);
    return NextResponse.json(extracted);
  } catch {
    return NextResponse.json({
      tasks: [],
      followUps: [],
      decisions: [{ summary: text }],
      keyQuotes: [],
    });
  }
}
