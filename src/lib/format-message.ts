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

/** How each platform writes emphasis. SMS has none, so nothing is restored there. */
const EMPHASIS: Record<
  MessageFormat,
  { bold: (s: string) => string; italic: (s: string) => string; code: (s: string) => string } | null
> = {
  slack: { bold: (s) => `*${s}*`, italic: (s) => `_${s}_`, code: (s) => `\`${s}\`` },
  teams: { bold: (s) => `**${s}**`, italic: (s) => `*${s}*`, code: (s) => `\`${s}\`` },
  email: { bold: (s) => `<strong>${s}</strong>`, italic: (s) => `<em>${s}</em>`, code: (s) => `<code>${s}</code>` },
  sms: null,
};

/**
 * Code, bold and italic spans written in the raw message, in markdown.
 *
 * Order matters. Code comes out first and is removed, so an identifier like
 * `physician_id` inside backticks is never mistaken for italics. Bold comes out before
 * italics so `**x**` isn't then read as an italic `*x*`.
 */
function emphasizedSpans(raw: string): { code: string[]; bold: string[]; italic: string[] } {
  const code: string[] = [];
  const bold: string[] = [];
  const italic: string[] = [];

  const withoutCode = raw.replace(/```[\s\S]*?```|`([^`\n]+)`/g, (_m, inline) => {
    if (inline) code.push(String(inline).trim());
    return " ";
  });
  const withoutBold = withoutCode.replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_m, a, b) => {
    bold.push(String(a ?? b).trim());
    return " ";
  });
  withoutBold.replace(/(?<![\w*])\*([^*\n]+?)\*(?!\w)|(?<![\w_])_([^_\n]+?)_(?!\w)/g, (_m, a, b) => {
    italic.push(String(a ?? b).trim());
    return " ";
  });
  return { code, bold, italic };
}

/**
 * Put back emphasis and code formatting the model dropped.
 *
 * The prompt asks for it and the local model (Qwen3 30B) still flattens `**Blocked**` to
 * plain "blocked" and strips the backticks off `typeorm` most of the time — it's pulled
 * toward the voice guide's terseness, and no amount of instruction reliably wins. So this is
 * done in code: for each code/bold/italic span in the raw message, find its unwrapped
 * occurrences in the output and wrap them in the platform's syntax.
 *
 * Backticks matter more than the emphasis did. A message about `physician_id` and
 * `machine_*` reads as prose noise without them, and Slack's own formatting is the whole
 * reason to run the message through a formatter.
 *
 * Deliberately conservative. Case-insensitive (the voice guide lowercases things), first
 * occurrence only, never inside code, and skipped entirely for spans under 3 characters or
 * already-emphasized text — a wrong bold is worse than a missing one.
 *
 * Known gap: a header line the model deletes outright can't be restored, because where it
 * belonged is a guess. Emphasis on surviving text is what this covers.
 */
function restoreEmphasis(raw: string, out: string, format: MessageFormat): string {
  const syntax = EMPHASIS[format];
  if (!syntax) return out;

  const { code, bold, italic } = emphasizedSpans(raw);
  let result = out;

  /** Wrap the first still-unwrapped occurrence. Returns false when there isn't one. */
  const wrapOnce = (s: string, wrap: (v: string) => string): boolean => {
    const segments = result.split(/(```[\s\S]*?```|`[^`\n]*`)/);
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].startsWith("`")) continue;  // already code
      const idx = segments[i].toLowerCase().indexOf(s.toLowerCase());
      if (idx === -1) continue;
      const before = segments[i][idx - 1] ?? "";
      const after = segments[i][idx + s.length] ?? "";
      if ("*_>`".includes(before) || "*_<`".includes(after)) continue;  // already emphasized
      segments[i] =
        segments[i].slice(0, idx) + wrap(segments[i].slice(idx, idx + s.length)) + segments[i].slice(idx + s.length);
      result = segments.join("");
      return true;
    }
    return false;
  };

  /** Restore a span as many times as the raw message emphasized it — a term mentioned
   *  three times in backticks should come back in backticks all three times. */
  const apply = (spans: string[], wrap: (s: string) => string, minLength = 3) => {
    const counts = new Map<string, number>();
    for (const raw of spans) {
      const s = raw.trim();
      if (s.length < minLength || s.length > 120) continue;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    for (const [s, times] of Array.from(counts.entries())) {
      for (let n = 0; n < times; n++) if (!wrapOnce(s, wrap)) break;
    }
  };

  // Code first, so bold/italic can't land inside an identifier that's about to be
  // backticked. Short identifiers are real (`id`, `ok`), so code has no 3-char floor.
  apply(code, syntax.code, 1);
  apply(bold, syntax.bold);
  apply(italic, syntax.italic);
  return result;
}

/**
 * Render formatted output as HTML, for the clipboard's `text/html` flavor.
 *
 * Slack (and Teams) render a rich paste directly; a plain-text paste of the same message
 * shows literal backticks and asks "Apply formatting?" instead. The web Formatter page has
 * always copied both flavors — it lifts the HTML out of its rendered preview — so this is
 * the same thing for clients that have no DOM to lift from (the Todo capture app).
 *
 * Not a general markdown renderer: it handles exactly what FORMAT_INSTRUCTIONS can produce.
 */
export function toRichHtml(text: string, format: MessageFormat): string | null {
  if (format === "email") return text;  // already HTML
  if (format === "sms") return null;    // plain by definition

  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const stash: string[] = [];
  const keep = (html: string) => `\u0001${stash.push(html) - 1}\u0002`;

  // Fenced blocks first, then inline code — both are held aside so emphasis rules can't
  // reach inside them.
  let out = text.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_m, body) =>
    keep(`<pre><code>${escape(String(body).replace(/\n$/, ""))}</code></pre>`),
  );
  out = escape(out).replace(/`([^`\n]+)`/g, (_m, code) => keep(`<code>${code}</code>`));

  if (format === "slack") {
    out = out.replace(/(?<![\w*])\*([^*\n]+?)\*(?!\w)/g, "<b>$1</b>");
    out = out.replace(/(?<![\w_])_([^_\n]+?)_(?!\w)/g, "<i>$1</i>");
  } else {
    out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>");
    out = out.replace(/(?<![\w*])\*([^*\n]+?)\*(?!\w)/g, "<i>$1</i>");
  }

  // Blocks: runs of list lines become a list, everything else a paragraph.
  const blocks: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const tag = list.ordered ? "ol" : "ul";
    blocks.push(`<${tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${tag}>`);
    list = null;
  };

  for (const line of out.split("\n")) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      continue;
    }
    flush();
    if (line.trim()) blocks.push(`<p>${line}</p>`);
  }
  flush();

  // Slack collapses adjacent <p> into single line breaks, so the blank line between
  // paragraphs disappears on paste. An explicit <br> between blocks restores it - the
  // same thing useFormatMessage.copyToClipboard does for the web page. Lists are
  // excluded: a <br> between list items breaks list rendering.
  const html = blocks.join("").replace(/<\/(p|pre|blockquote)>(?=<)/g, "</$1><br>");
  return html.replace(/\u0001(\d+)\u0002/g, (_m, i) => stash[Number(i)]);
}

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
- PRESERVE existing lists: every input line starting with -, *, •, or a number is a list item and MUST stay a list item in the output. Never flatten a list into prose, never drop items, never merge items. A BULLETED input list stays bulleted — replace the input's marker with "- " (never stack markers — output "- item", NOT "- * item"). A NUMBERED input list stays numbered ("1. item"); never renumber it into dashes.
- PRESERVE existing emphasis. This is the one thing you must carry over, translated into the platform's syntax:
  - Input **bold** or __bold__ stays bold, in this platform's bold syntax.
  - Input *italic* or _italic_ stays italic, in this platform's italic syntax.
  - Input \`code\` and code blocks stay code.
  - An input header line (#, ##, ###) is a real section label — keep it as its own line in the platform's nearest equivalent (bold line for Slack/SMS, header for email, bold for Teams). Never delete it, never fold it into the next sentence.
  The rule below about not ADDING emphasis is about emphasis the input does not have. Emphasis the input DOES have is content, and dropping it loses meaning.
- A line that does NOT start with a list marker is NOT a list item — keep it as a plain paragraph line even when it sits directly between two lists.
- Do NOT add a title, header, subject line, or summary line the raw message doesn't have.
- Do NOT bold, italicize, or split off the opening line/greeting — it stays plain prose exactly where it is.
- Do NOT add NEW emphasis the raw message doesn't have. Adding \`code\` backticks per the rules above is the only formatting you introduce on your own — everything else you only ever carry across.
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

CARRY-OVER CHECK — do this before you answer, silently:
Every **bold** span, *italic* span, \`code\` span, header line, and numbered item in RAW MESSAGE
must appear in your output, with the same emphasis, in this platform's syntax.
Bold in -> bold out. Italic in -> italic out. Header line in -> its own emphasized line out
(never deleted, never merged into the next sentence). "1." "2." in -> "1." "2." out.
If your draft dropped any of them, put them back before returning it.

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

  // Last, so the platform's own syntax is already settled and nothing below rewrites what
  // this puts back.
  return restoreEmphasis(rawMessage, formatted, format);
}
