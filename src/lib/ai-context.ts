import { prisma } from "./prisma";
import { getCurrentBlock, getTimeLabel } from "./schedule";

// Layer 1: System prompt
function buildSystemPrompt(): string {
  return `You are the AI assistant for Conductor, a personal productivity system for an engineer managing 6 concurrent W2 engineering roles.

Roles (priority order):
1. Zeta — UI Director / Staff Engineer (Slack) — highest pay
2. HealthMap — Principal UI Architect (Teams)
3. vQuip — CTO, 3% equity (Slack) — meetings 10:30am-3pm
4. HealthMe — Sr UI Engineer (Slack)
5. Xenegrade — Sr Engineer (Slack)
6. React Health — Sr Node/NestJS Engineer (Teams) — lowest touch

Priority waterfall: When a time block has no work, pull from the highest-priority role that has tasks.

Schedule: b1(7:30-10), b2(10-10:30 triage), b3(10:30-3 vQuip), b4(3-4), b5(4-5), b6(7-8pm).
5 PM hard stop for family. 7-8 PM low-touch work.

Rules:
- Be concise and actionable
- When drafting messages, match the role's tone
- Never suggest time tracking or hour logging
- Follow-ups are separate from tasks
- Refer to staff by name when relevant`;
}

// Layer 2: State snapshot
async function buildStateSnapshot(): Promise<string> {
  const now = new Date();
  const current = getCurrentBlock(now);
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

  const taskLines = todayTasks.map((t) => `- [${t.role.name}] ${t.title}${t.priority === "urgent" ? " (URGENT)" : ""}`).join("\n");

  return `Date: ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
Current block: ${current ? `${current.block.label} (${getTimeLabel(current.block)})` : "Off the clock"}
Active role: ${current?.roleId || "none"}

Today's tasks:
${taskLines || "(none selected)"}

Follow-ups: ${activeFollowUps} active, ${staleFollowUps} stale`;
}

// Layer 3: Role context
async function buildRoleContext(roleId: string): Promise<string> {
  const [role, recentTranscripts] = await Promise.all([
    prisma.role.findUnique({
      where: { id: roleId },
      include: {
        staff: true,
        notes: { take: 5, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.transcript.findMany({
      where: { roleId },
      take: 3,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!role) return "";

  const staffLines = role.staff.map((s) =>
    `- ${s.name} (${s.title})${s.relationship ? ` — ${s.relationship}` : ""}${s.commNotes ? ` [Comm: ${s.commNotes}]` : ""}`
  ).join("\n");

  const noteLines = role.notes.map((n) =>
    `- [${n.createdAt.toLocaleDateString()}] ${n.content.slice(0, 200)}`
  ).join("\n");

  const transcriptLines = recentTranscripts.map((t) => {
    const text = t.summary || t.rawText.slice(0, 500) + (t.rawText.length > 500 ? "..." : "");
    return `- [${t.createdAt.toLocaleDateString()}] ${text}`;
  }).join("\n\n");

  return `Active role: ${role.name} — ${role.title}
Platform: ${role.platform}
Tone: ${role.tone || "Professional"}
Context: ${role.context || ""}

Staff directory:
${staffLines || "(no staff)"}

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

async function buildRetrievedContext(roleId: string, query: string): Promise<string> {
  const keywords = extractKeywords(query);

  // If no meaningful keywords, skip retrieval (Layer 3 already has recents)
  if (keywords.length === 0) return "";

  // Search for notes/transcripts matching ANY keyword
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
    parts.push("Related notes:\n" + notes.map((n) => `- ${n.content.slice(0, 300)}`).join("\n"));
  }
  if (transcripts.length > 0) {
    parts.push("Related transcripts:\n" + transcripts.map((t) => {
      const text = t.summary || t.rawText.slice(0, 800) + (t.rawText.length > 800 ? "..." : "");
      return `- ${text}`;
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

  // Layer 2: State snapshot
  parts.push(await buildStateSnapshot());

  // Layer 3: Role context
  if (options.roleId) {
    parts.push(await buildRoleContext(options.roleId));
  }

  // Layer 4: Retrieved context
  if (options.includeRetrieved && options.roleId && options.query) {
    const retrieved = await buildRetrievedContext(options.roleId, options.query);
    if (retrieved) parts.push(retrieved);
  }

  return {
    systemPrompt: buildSystemPrompt(),
    contextMessages: parts.join("\n\n---\n\n"),
  };
}

export async function getConversationMessages(roleId: string, limit: number = 10): Promise<Array<{ role: string; content: string }>> {
  const conv = await prisma.conversation.findUnique({ where: { roleId } });
  if (!conv) return [];
  const messages = conv.messages as Array<{ role: string; content: string }>;
  return messages.slice(-limit);
}
