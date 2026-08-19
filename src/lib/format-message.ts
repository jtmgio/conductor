import { assembleContext } from "@/lib/ai-context";
import { voiceGuideBlock } from "@/lib/voice-guide";
import { createCompletionWithLocalFallback, getDefaultTextModel } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export type MessageFormat = "slack" | "teams" | "email" | "sms";
export const MESSAGE_FORMATS = ["slack", "teams", "email", "sms"] as const;

const FORMAT_INSTRUCTIONS: Record<MessageFormat, string> = {
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
- NO headers (# or ###) — if (and only if) the raw message already has a header/section label, render it as a short *bold* line
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

/** Rewrite a raw message in the user's voice for a role, with platform-correct
 *  formatting. Shared by /api/ai/format-message and the MCP format_message tool. */
export async function formatMessage(opts: {
  roleId: string;
  rawMessage: string;
  format: MessageFormat;
}): Promise<string> {
  const { roleId, rawMessage, format } = opts;

  const { systemPrompt, contextMessages } = await assembleContext({ roleId });
  const formatInstructions = FORMAT_INSTRUCTIONS[format];

  const prompt = `Reformat the following raw message in my voice and tone for this role.
Keep the same meaning and intent — just make it sound like me and apply the platform's formatting syntax.

${formatInstructions}

STRUCTURE (critical — this is a light formatting pass, NOT a rewrite):
- PRESERVE the original structure. If the raw message is conversational prose paragraphs, the output is conversational prose paragraphs.
- Do NOT convert prose into bullet points. Only use a list if the raw message itself is already a list.
- PRESERVE existing lists: every input line starting with -, *, •, or a number is a list item and MUST stay a list item in the output. Never flatten a list into prose, never drop items, never merge items. REPLACE the input's marker with "- " (never stack markers — output "- item", NOT "- * item").
- A line that does NOT start with a list marker is NOT a list item — keep it as a plain paragraph line even when it sits directly between two lists.
- Do NOT add a title, header, subject line, or summary line the raw message doesn't have.
- Do NOT bold, italicize, or split off the opening line/greeting — it stays plain prose exactly where it is.
- Do NOT add emphasis the raw message doesn't have. Adding \`code\` backticks per the rules above is the ONLY formatting you introduce.
- Do NOT drop or merge points. Every distinct point in the raw message survives.
- Keep the paragraph breaks roughly where the raw message has them.
- Your job is syntax (bold/italic/code/links for the platform) plus voice — not reorganization.

VOICE vs STRUCTURE — which rule wins:
- The VOICE GUIDE above governs wording, casing, punctuation, register, and rhythm. Apply it
  in full: lowercase, short, no emoji, no greetings or sign-offs, none of the banned phrases.
- These STRUCTURE rules govern content. The voice guide NEVER licenses dropping a point,
  inventing one, reordering them, or turning a list into prose.
- So: rewrite how it sounds, keep exactly what it says.

IMPORTANT:
- Don't add content I didn't include
- Don't remove important information
- Register comes from this role's tone and who the message is going to — peer, stakeholder,
  or family — per the voice guide's registers section
- Return ONLY the formatted message, no explanations or commentary
- Do NOT wrap in markdown code fences

RAW MESSAGE:
${rawMessage}`;

  const result = await createCompletionWithLocalFallback({
    model: getDefaultTextModel(),
    // The voice guide goes last so it's the freshest thing in the system prompt — it is the
    // whole point of this call, and role tone/profile context sit above it as modifiers.
    system: `${systemPrompt}\n\n[Context]\n${contextMessages}\n\n[VOICE GUIDE — the source of truth for how the user writes. Match it exactly.]\n${voiceGuideBlock()}`,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2048,
    // Formatting is a fidelity task — without this the MLX server's default (~0.7)
    // makes structure preservation a dice roll (observed: lists flattened to prose)
    temperature: 0.2,
  });

  await trackUsage("format-message", result.model, result.usage, roleId);

  let formatted = result.text.trim();
  // Strip a WRAPPING code fence (model fenced the whole reply) — but leave
  // legitimate code blocks inside the message alone
  const fenceCount = (formatted.match(/```/g) || []).length;
  if (formatted.startsWith("```") && formatted.endsWith("```") && fenceCount === 2) {
    formatted = formatted.replace(/^```(?:html|markdown|mrkdwn)?\n?/, "").replace(/\n?```$/, "").trim();
  }
  // Em-dashes are banned by the voice guide and are the one tell models re-introduce no
  // matter the instruction. Outside code blocks, normalize to his spaced hyphen.
  formatted = formatted
    .split(/(```[\s\S]*?```)/)
    .map((seg) => (seg.startsWith("```") ? seg : seg.replace(/\s*—\s*/g, " - ")))
    .join("");

  if (format === "slack") {
    // Safety net: models reflexively emit **markdown bold** and ### headers no matter
    // the instructions; Slack renders both as literal characters. Also normalize
    // stacked list markers ("- * item" when the model prefixes the raw bullet instead
    // of replacing it). Apply only OUTSIDE code blocks — inside them, ** and # (shell
    // comments) are content.
    formatted = formatted
      .split(/(```[\s\S]*?```)/)
      .map((seg) =>
        seg.startsWith("```")
          ? seg
          : seg
              .replace(/\*\*(.+?)\*\*/g, "*$1*")
              .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
              .replace(/^(\s*)- [*•] /gm, "$1- "),
      )
      .join("");
  }
  return formatted;
}
