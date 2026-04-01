import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assembleContext } from "@/lib/ai-context";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roleId, content, contentType } = await req.json();
  if (!roleId || !content) {
    return NextResponse.json({ error: "roleId and content required" }, { status: 400 });
  }

  const { systemPrompt, contextMessages } = await assembleContext({ roleId });

  const extractPrompt = `Analyze the following ${contentType || "content"} and extract structured data.

Return a JSON object with these arrays (each can be empty):
- tasks: [{title: string, priority: "normal"|"urgent"}]
- followUps: [{title: string, waitingOn: string}]
- decisions: [{summary: string}]
- keyQuotes: [{text: string, speaker?: string}]

Only include items that are clearly present. Be concise in titles.

Content to analyze:
${content}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: `${systemPrompt}\n\nContext:\n${contextMessages}\n\nYou must respond with valid JSON only, no markdown fences.`,
    messages: [{ role: "user", content: extractPrompt }],
  });

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
