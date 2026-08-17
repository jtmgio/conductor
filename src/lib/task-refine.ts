import { prisma } from "@/lib/prisma";
import { createCompletionWithLocalFallback, getDefaultTextModel } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export interface RefinedTask {
  title: string;
  notes: string | null;
  checklist: Array<{ text: string; done: boolean }> | null;
  priority: "urgent" | "normal";
  dueDate: string | null;
  /** Role name the model picked — only set when inferRole was requested */
  role?: string | null;
  /** How sure the model is about the role pick */
  roleConfidence?: "high" | "low" | null;
  /** Words quoted from the input that justify the role pick */
  roleEvidence?: string | null;
}

/** True when the quoted evidence genuinely names the role or one of its people.
 *  Deterministic backstop for the model's confidence claim — topic words like
 *  "dashboard" won't pass, a first name like "Dave" will. */
function evidenceMatchesRole(
  evidence: string,
  role: { name: string; staff: Array<{ name: string }> }
): boolean {
  const ev = evidence.trim().toLowerCase();
  if (!ev) return false;
  const roleName = role.name.trim().toLowerCase();
  if (ev.includes(roleName) || roleName.includes(ev)) return true;
  const evTokens = ev.split(/\s+/);
  return role.staff.some((s) => {
    const staffName = s.name.trim().toLowerCase();
    if (staffName.includes(ev) || ev.includes(staffName)) return true;
    return staffName.split(/\s+/).some((tok) => tok.length > 2 && evTokens.includes(tok));
  });
}

/**
 * Split a brain dump into a card WITHOUT AI — first sentence becomes the title, the
 * whole text goes to notes.
 *
 * The fallback for every path that would otherwise use the raw input as the title:
 * `refine: false` callers (external agents that pass a fully-written paragraph), and
 * refine failures. A 500-character title is never the right answer — VQ-150 and HM-81
 * were both filed that way, unreadable on the board. Nothing is lost: the complete
 * original always lands in notes.
 */
export function splitRawTask(rawText: string): { title: string; notes: string | null } {
  const full = rawText.trim();
  const oneLine = full.replace(/\s+/g, " ");

  // Short and single-line: it's already a title.
  if (oneLine.length <= 100 && !full.includes("\n")) return { title: oneLine, notes: null };

  // Prefer a real first sentence, but only if it's title-shaped on its own.
  const sentence = oneLine.match(/^(.{15,110}?)[.!?](?:\s|$)/);
  let title = sentence?.[1]?.trim() ?? "";

  if (!title) {
    // No usable sentence break — take whole words up to the limit.
    const words = oneLine.split(" ");
    title = "";
    for (const w of words) {
      if ((title + " " + w).trim().length > 80) break;
      title = (title + " " + w).trim();
    }
    if (!title) title = oneLine.slice(0, 80);
    title += "…";
  }

  return { title, notes: full };
}

/**
 * Parse a raw brain-dump into a structured task card (short title, notes,
 * checklist, priority, resolved dueDate). Shared by /api/tasks/refine and the
 * MCP create_task tool.
 *
 * When roleId is omitted and inferRole is true, the model also picks the best
 * role from the role directory (names + responsibilities).
 */
export async function refineTask(opts: {
  rawText: string;
  roleId?: string | null;
  inferRole?: boolean;
}): Promise<RefinedTask> {
  const { rawText, roleId, inferRole } = opts;

  const [role, allRoles, existingTasks] = await Promise.all([
    roleId ? prisma.role.findUnique({ where: { id: roleId }, select: { name: true, responsibilities: true } }) : null,
    !roleId && inferRole
      ? prisma.role.findMany({
          select: {
            name: true,
            responsibilities: true,
            staff: { select: { name: true, title: true } },
          },
          orderBy: { priority: "asc" },
        })
      : Promise.resolve([]),
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

  const roleDirectory = allRoles
    .map((r) => {
      const staff = r.staff.map((s) => s.name).join(", ");
      return `ROLE: ${r.name}${r.responsibilities ? `\n  Focus: ${r.responsibilities.slice(0, 200)}` : ""}${staff ? `\n  People: ${staff}` : ""}`;
    })
    .join("\n");

  const prompt = `Parse this brain dump into a structured task card.

TODAY: ${dayName}, ${today}
INPUT: "${rawText}"
${role ? `ROLE: ${role.name}` : ""}
${roleDirectory ? `\nROLE DIRECTORY (pick the role this task belongs to):\n${roleDirectory}` : ""}
${existingList ? `\nEXISTING TASKS (avoid duplicates):\n${existingList}` : ""}

Return JSON:
{
  "title": "SHORT title — 5-10 words max, imperative verb, like a Kanban card",
  "notes": "All the details, context, and constraints from the input go here. This is the description.",
  "checklist": [{"text": "step 1", "done": false}] or null,
  "priority": "urgent" or "normal",
  "dueDate": "YYYY-MM-DD" or null${roleDirectory ? `,
  "roleEvidence": "exact words quoted from INPUT that name a person or company, or null",
  "role": "role name EXACTLY as it appears after ROLE: in the directory, or null",
  "roleConfidence": "high" or "low"` : ""}
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
5. Only "urgent" if explicitly time-sensitive or blocking${roleDirectory ? `
6. Role selection — follow this procedure EXACTLY:
   a. Scan the INPUT for (i) a person's name matching someone in a People list (first name
      alone counts if it matches exactly one person across all lists), or (ii) a
      role/company/product name from the directory.
   b. Found one? Set roleEvidence to the exact quoted words from INPUT, role to that role's
      name, roleConfidence "high".
   c. Found none? roleEvidence MUST be null and roleConfidence MUST be "low". You may still
      suggest the most plausible role, or null if nothing fits.
   Topic overlap with a role's Focus (input mentions dashboards, a role does dashboards) is
   NOT evidence — that is case (c). If you cannot quote evidence words, confidence is "low".` : ""}
${roleDirectory ? "7" : "6"}. Return ONLY the JSON object, no markdown fences`;

  const result = await createCompletionWithLocalFallback({
    model: getDefaultTextModel(),
    system: "You are a task parser. Return only valid JSON.",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1024,
    // Parsing/classification wants determinism — server default temp makes role
    // inference and JSON shape vary run to run
    temperature: 0.1,
  });

  await trackUsage("task-refine", result.model, result.usage, roleId || undefined);

  let text = result.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }
  const refined = JSON.parse(text) as RefinedTask;

  // Deterministic check on the model's "high" confidence: the quoted evidence
  // must actually name the role or someone in it, or we downgrade to "low"
  // (which makes the MCP tool ask the user instead of guessing).
  if (refined.role && refined.roleConfidence === "high" && allRoles.length > 0) {
    const picked = allRoles.find((r) => r.name.toLowerCase() === refined.role!.trim().toLowerCase());
    if (!picked || !refined.roleEvidence || !evidenceMatchesRole(refined.roleEvidence, picked)) {
      refined.roleConfidence = "low";
    }
  }
  return refined;
}
