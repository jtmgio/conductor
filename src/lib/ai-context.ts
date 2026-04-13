import { prisma } from "./prisma";
import { getCurrentBlock, getTimeLabel, getScheduleBlocks } from "./schedule";

// Layer 1: System prompt (built dynamically from DB)
async function buildSystemPrompt(): Promise<string> {
  const roles = await prisma.role.findMany({
    where: { active: true },
    orderBy: { priority: "asc" },
  });

  const roleList = roles.length > 0
    ? roles.map((r, i) => `${i + 1}. ${r.name} — ${r.title} (${r.platform})${r.context ? ` — ${r.context}` : ""}`).join("\n")
    : "(No roles configured yet)";

  const blocks = await getScheduleBlocks();
  const scheduleDesc = blocks.length > 0
    ? blocks.map((b) => `${b.label} (${getTimeLabel(b)})`).join(", ")
    : "(No schedule configured)";

  return `You are the AI assistant for Conductor, a personal productivity system for an engineer managing multiple concurrent roles.

Roles (priority order):
${roleList}

Priority waterfall: When a time block has no work, pull from the highest-priority role that has tasks.

Schedule: ${scheduleDesc}

Rules:
- Be concise and actionable
- When drafting messages, match the user's personal voice EXACTLY. Do not add formality, filler, or corporate language. The user's sample messages are your primary tone reference.
- Never start drafts with "Hi [name]," or "Hey [name]," unless the user's samples show that pattern.
- Never use "I hope this finds you well", "just wanted to follow up", "per our conversation", "please don't hesitate to reach out" or similar filler.
- Never suggest time tracking or hour logging
- Follow-ups are separate from tasks
- Refer to staff by name when relevant
- When discussing goals, reference the current quarterly goals for the active role

Artifacts:
When the user asks you to visualize, diagram, chart, or build an interactive tool, you can create an artifact.
Wrap the code in :::artifact{title="..." type="html|react|mermaid"} ... ::: delimiters.
The artifact renders as a live interactive widget in the chat. For HTML artifacts, you have access to window.CONDUCTOR_DATA which contains the user's real roles, tasks, follow-ups, and current schedule.
Use artifacts for: workflow diagrams, task/role visualizations, charts, sprint planning boards, data dashboards, interactive calculators, mermaid diagrams for architecture.
Don't use artifacts for: simple text answers, short lists or tables (use markdown), anything that doesn't benefit from interactivity.`;
}

// Layer 1.5: Voice profile
async function buildVoiceProfile(): Promise<string> {
  const profile = await prisma.userProfile.findUnique({ where: { id: "default" } });
  if (!profile) return "";

  const parts: string[] = [];
  if (profile.communicationStyle) {
    parts.push(`CRITICAL — User's communication style (match this EXACTLY in all drafts and responses):\n${profile.communicationStyle}`);
  }
  if (profile.sampleMessages) {
    parts.push(`Real messages from the user (use these as your primary reference for tone, cadence, and vocabulary):\n${profile.sampleMessages}`);
  }
  if (profile.globalContext) {
    parts.push(`About the user:\n${profile.globalContext}`);
  }
  return parts.join("\n\n");
}

// Layer 2: State snapshot
async function buildStateSnapshot(): Promise<string> {
  const now = new Date();
  const current = await getCurrentBlock(now);
  const todayTasks = await prisma.task.findMany({
    where: { isToday: true, done: false },
    include: { role: { select: { name: true } } },
    orderBy: { role: { priority: "asc" } },
  });
  const activeFollowUps = await prisma.followUp.count({ where: { status: "waiting" } });
  const staleFollowUps = await prisma.followUp.count({
    where: {
      status: "waiting",
      createdAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    },
  });

  const taskLines = todayTasks.map((t) =>
    `- [${t.role.name}] ${t.title}${t.priority === "urgent" ? " (URGENT)" : ""}${t.status !== "backlog" ? ` [${t.status}]` : ""}`
  ).join("\n");

  return `Date: ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
Current block: ${current ? `${current.block.label} (${getTimeLabel(current.block)})` : "Off the clock"}
Active role: ${current?.roleId || "none"}

Today's tasks:
${taskLines || "(none selected)"}

Follow-ups: ${activeFollowUps} active, ${staleFollowUps} stale`;
}

// Layer 3: Role context (includes responsibilities, goals, pinned notes, recent notes)
async function buildRoleContext(roleId: string): Promise<string> {
  const [role, recentTranscripts, pinnedNotes] = await Promise.all([
    prisma.role.findUnique({
      where: { id: roleId },
      include: {
        staff: true,
        notes: { take: 5, orderBy: { createdAt: "desc" }, where: { pinned: false } },
      },
    }),
    prisma.transcript.findMany({
      where: { roleId },
      take: 3,
      orderBy: { createdAt: "desc" },
    }),
    // Pinned notes always included (improvement #3)
    prisma.note.findMany({
      where: { roleId, pinned: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!role) return "";

  const staffLines = role.staff.map((s) =>
    `- ${s.name} (${s.title})${s.relationship ? ` — ${s.relationship}` : ""}${s.commNotes ? ` [Comm: ${s.commNotes}]` : ""}`
  ).join("\n");

  const noteLines = role.notes.map((n) => {
    // Use summary if available (improvement #4), otherwise slice content
    const text = n.summary || n.content.slice(0, 300);
    return `- [${n.createdAt.toLocaleDateString()}] ${text}`;
  }).join("\n");

  // Pinned notes get more space since user explicitly marked them important
  const pinnedLines = pinnedNotes.map((n) => {
    const text = n.summary || n.content.slice(0, 2000);
    return `- [PINNED] ${text}`;
  }).join("\n\n");

  const transcriptLines = recentTranscripts.map((t) => {
    const text = t.summary || t.rawText.slice(0, 500) + (t.rawText.length > 500 ? "..." : "");
    return `- [${t.createdAt.toLocaleDateString()}] ${text}`;
  }).join("\n\n");

  return `Active role: ${role.name} — ${role.title}
Platform: ${role.platform}
${role.responsibilities ? `\nResponsibilities:\n${role.responsibilities}` : ""}
${role.quarterlyGoals ? `\nQuarterly goals:\n${role.quarterlyGoals}` : ""}
Tone: ${role.tone || "Professional"}
Context: ${role.context || ""}

Staff directory:
${staffLines || "(no staff)"}
${pinnedNotes.length > 0 ? `\nPinned documents/notes (always available):\n${pinnedLines}` : ""}

Recent notes:
${noteLines || "(no notes)"}

Recent transcripts/meeting notes:
${transcriptLines || "(none)"}`;
}

// Layer 4: Retrieved context (on demand)
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it",
  "they", "them", "this", "that", "these", "those", "what", "which",
  "who", "whom", "how", "when", "where", "why", "not", "no", "nor",
  "and", "or", "but", "if", "then", "so", "than", "too", "very",
  "just", "about", "up", "out", "on", "off", "over", "under", "in",
  "to", "from", "with", "at", "by", "for", "of", "into", "any",
  "all", "go", "went", "get", "got", "tell", "said", "like",
]);

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// Find the most relevant chunk of a document for given keywords (improvement #5)
function findBestChunk(content: string, keywords: string[], chunkSize: number = 3000): string {
  if (content.length <= chunkSize) return content;

  // Split into overlapping chunks
  const step = Math.floor(chunkSize * 0.6); // 40% overlap
  const chunks: Array<{ text: string; score: number }> = [];

  for (let i = 0; i < content.length; i += step) {
    const chunk = content.slice(i, i + chunkSize);
    // Score by keyword density
    const lower = chunk.toLowerCase();
    const score = keywords.reduce((acc, kw) => {
      const matches = lower.split(kw.toLowerCase()).length - 1;
      return acc + matches;
    }, 0);
    chunks.push({ text: chunk, score });
    if (i + chunkSize >= content.length) break;
  }

  // Return highest-scoring chunk
  chunks.sort((a, b) => b.score - a.score);
  return chunks[0]?.text || content.slice(0, chunkSize);
}

async function buildRetrievedContext(roleId: string, query: string): Promise<string> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return "";

  const noteConditions = keywords.map((kw) => ({
    content: { contains: kw, mode: "insensitive" as const },
  }));
  const transcriptConditions = keywords.flatMap((kw) => [
    { rawText: { contains: kw, mode: "insensitive" as const } },
    { summary: { contains: kw, mode: "insensitive" as const } },
  ]);

  const [notes, transcripts] = await Promise.all([
    prisma.note.findMany({
      where: { roleId, OR: noteConditions },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.transcript.findMany({
      where: { roleId, OR: transcriptConditions },
      take: 3,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const parts: string[] = [];
  if (notes.length > 0) {
    parts.push("Related notes:\n" + notes.map((n) => {
      // Use summary if available (improvement #4)
      if (n.summary) return `- ${n.summary}`;
      // Otherwise find the best chunk matching the keywords (improvement #5)
      return `- ${findBestChunk(n.content, keywords, 3000)}`;
    }).join("\n\n"));
  }
  if (transcripts.length > 0) {
    parts.push("Related transcripts:\n" + transcripts.map((t) => {
      if (t.summary) return `- ${t.summary}`;
      return `- ${findBestChunk(t.rawText, keywords, 2000)}`;
    }).join("\n\n"));
  }
  return parts.join("\n\n");
}

export interface ContextOptions {
  roleId?: string;
  query?: string;
  includeRetrieved?: boolean;
}

export async function assembleContext(options: ContextOptions = {}): Promise<{
  systemPrompt: string;
  contextMessages: string;
}> {
  const parts: string[] = [];

  // Layer 1.5: Voice profile
  const voiceProfile = await buildVoiceProfile();
  if (voiceProfile) parts.push(voiceProfile);

  // Layer 2: State snapshot
  parts.push(await buildStateSnapshot());

  // Layer 3: Role context (now includes responsibilities + goals)
  if (options.roleId) {
    parts.push(await buildRoleContext(options.roleId));
  }

  // Layer 4: Retrieved context
  if (options.includeRetrieved && options.roleId && options.query) {
    const retrieved = await buildRetrievedContext(options.roleId, options.query);
    if (retrieved) parts.push(retrieved);
  }

  return {
    systemPrompt: await buildSystemPrompt(),
    contextMessages: parts.join("\n\n---\n\n"),
  };
}

export async function getConversationMessages(roleId: string, limit: number = 10, threadId?: string): Promise<Array<{ role: string; content: string }>> {
  const conv = threadId
    ? await prisma.conversation.findUnique({ where: { id: threadId } })
    : await prisma.conversation.findFirst({ where: { roleId, isDefault: true } });
  if (!conv) return [];
  const messages = conv.messages as Array<{ role: string; content: string }>;
  return messages.slice(-limit);
}
