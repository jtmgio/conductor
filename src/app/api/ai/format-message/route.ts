import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assembleContext } from "@/lib/ai-context";
import { createCompletionWithLocalFallback, getDefaultTextModel } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export const dynamic = "force-dynamic";

type FormatType = "slack" | "teams" | "email" | "sms";

const FORMAT_INSTRUCTIONS: Record<FormatType, string> = {
  email: `Return the formatted message as clean HTML suitable for email.
Use these tags: <p>, <strong>, <em>, <ul>, <ol>, <li>, <br>, <h3>, <code>, <pre>.
Wrap commands, file paths, and identifiers in <code>; multi-command sequences in <pre> with one command per line.
Do NOT wrap in <html>/<body> — just the message content.
Do NOT include a subject line or greeting unless the original had one.`,

  slack: `Return the formatted message using Slack mrkdwn — this is NOT standard markdown:
- Bold: *text* (SINGLE asterisks — never **double asterisks**, Slack renders those as literal * characters)
- Italic: _text_ (underscores, not asterisks)
- Strikethrough: ~text~
- Bulleted list: - item (dash, one item per line)
- Numbered list: 1. item
- Block quote: > text
- Links: paste the bare URL — [markdown links](url) do NOT render in Slack
- NO headers (# or ###) — use a short *bold* line as a section label instead
- Line breaks: one blank line between paragraphs

CODE FORMATTING (critical — the reader may copy-paste these):
- Wrap EVERY shell command, file path, branch name, flag, env var, function name, and UI-menu path token in \`inline backticks\` — e.g. \`git checkout -b review/round-1\`, \`docs/guide.md\`, \`npm ci\`
- A sequence of 2+ commands goes in a triple-backtick code block, ONE command per line, never run together in a sentence:
\`\`\`
git checkout -b review/round-1
cd prototype/storybook
npm ci
\`\`\`
- Never merge multiple commands onto one prose line. If the raw message has commands inline, pull them out into a code block.

Do NOT use HTML tags. Do NOT use bullet character (•).`,

  teams: `Return the formatted message using standard markdown:
- Bold: **text**
- Italic: *text*
- Bulleted list: - item (use dash, one item per line)
- Numbered list: 1. item
- Line breaks: use two newlines for paragraph breaks

CODE FORMATTING (critical — the reader may copy-paste these):
- Wrap every shell command, file path, branch name, flag, and env var in \`inline backticks\`
- A sequence of 2+ commands goes in a triple-backtick code block, ONE command per line — never run commands together in a sentence

Do NOT use HTML tags.`,

  sms: `Return the formatted message as plain text optimized for SMS/text:
- Keep it concise (under 320 chars if possible)
- No formatting, no bullets, no HTML
- Use line breaks sparingly
- Get to the point fast`,
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roleId, rawMessage, format = "slack" } = await req.json();
  if (!rawMessage?.trim()) return NextResponse.json({ error: "rawMessage required" }, { status: 400 });
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });

  const validFormat = (["slack", "teams", "email", "sms"] as FormatType[]).includes(format) ? format as FormatType : "slack";

  // Assemble voice + role context
  const { systemPrompt, contextMessages } = await assembleContext({ roleId });

  const formatInstructions = FORMAT_INSTRUCTIONS[validFormat];

  const prompt = `Reformat the following raw message in my voice and tone for this role.
Keep the same meaning and intent — just make it sound like me and format it properly.

${formatInstructions}

IMPORTANT:
- Match my communication style and tone exactly
- Don't add content I didn't include
- Don't remove important information
- Keep the same level of formality/informality as my style dictates
- Return ONLY the formatted message, no explanations or commentary
- Do NOT wrap in markdown code fences

RAW MESSAGE:
${rawMessage}`;

  try {
    const result = await createCompletionWithLocalFallback({
      model: getDefaultTextModel(),
      system: `${systemPrompt}\n\n[Context]\n${contextMessages}`,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    });

    await trackUsage("format-message", result.model, result.usage, roleId);

    let formatted = result.text.trim();
    // Strip a WRAPPING code fence (model fenced the whole reply) — but leave
    // legitimate code blocks inside the message alone
    const fenceCount = (formatted.match(/```/g) || []).length;
    if (formatted.startsWith("```") && formatted.endsWith("```") && fenceCount === 2) {
      formatted = formatted.replace(/^```(?:html|markdown|mrkdwn)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    if (validFormat === "slack") {
      // Safety net: models reflexively emit **markdown bold** and ### headers no matter
      // the instructions; Slack renders both as literal characters. Apply only OUTSIDE
      // code blocks — inside them, ** and # (shell comments) are content.
      formatted = formatted
        .split(/(```[\s\S]*?```)/)
        .map((seg) =>
          seg.startsWith("```")
            ? seg
            : seg.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/^#{1,6}\s+(.+)$/gm, "*$1*"),
        )
        .join("");
    }

    return NextResponse.json({ formatted, format: validFormat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
