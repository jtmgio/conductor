import { createHash, timingSafeEqual } from "crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBlock, getTimeLabel } from "@/lib/schedule";
import { today, formatDateOnly } from "@/lib/dates";
import { invalidateRebalanceCache } from "@/lib/schedule-rebalance";
import { refineTask, splitRawTask, type RefinedTask } from "@/lib/task-refine";
import { formatMessage } from "@/lib/format-message";
import { taskKey, parseTaskKey, looksLikeTaskKey } from "@/lib/task-key";

export const dynamic = "force-dynamic";

// MCP endpoint for external agents (Claude Code over Tailscale).
// Auth: Bearer token matched against MCP_API_TOKEN — NextAuth sessions don't
// apply here since clients are not browsers. Fails closed if the env is unset.

const VALID_STATUSES = ["backlog", "in_progress", "in_review", "blocked"] as const;

/** Resolve a role by id or (partial, case-insensitive) name. Throws with the
 *  available role names so the calling agent can self-correct. */
async function resolveRole(roleRef: string) {
  const roles = await prisma.role.findMany({
    select: { id: true, name: true },
    orderBy: { priority: "asc" },
  });
  const ref = roleRef.trim().toLowerCase();
  const match =
    roles.find((r) => r.id === roleRef) ||
    roles.find((r) => r.name.toLowerCase() === ref) ||
    roles.find((r) => r.name.toLowerCase().includes(ref));
  if (!match) {
    throw new Error(`Unknown role "${roleRef}". Available roles: ${roles.map((r) => r.name).join(", ")}`);
  }
  return match;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function taskShape(t: {
  id: string; title: string; status: string; priority: string; done: boolean;
  scheduledFor: Date | null; dueDate: Date | null; notes: string | null;
  number?: number | null; externalKey?: string | null;
  role?: { name: string; taskPrefix?: string | null } | null;
}) {
  return {
    // Human key ("VQ-14", or Linear's own "MED-54"). Prefer this when talking to
    // the user; `id` is the cuid and is only needed as a fallback.
    key: taskKey(t, t.role),
    id: t.id,
    title: t.title,
    role: t.role?.name,
    status: t.status,
    priority: t.priority,
    done: t.done,
    scheduledFor: formatDateOnly(t.scheduledFor),
    dueDate: t.dueDate ? t.dueDate.toISOString().split("T")[0] : null,
    notes: t.notes || undefined,
  };
}

/**
 * Resolve a task reference that may be a human key ("VQ-14", "MED-54") or a raw cuid.
 * Keys are what the user actually says out loud, so every tool taking a taskId
 * routes through here.
 */
async function resolveTaskId(ref: string): Promise<string> {
  if (!looksLikeTaskKey(ref)) return ref;
  const byExternal = await prisma.task.findFirst({ where: { externalKey: { equals: ref.trim(), mode: "insensitive" } }, select: { id: true } });
  if (byExternal) return byExternal.id;
  const parsed = parseTaskKey(ref)!;
  const task = await prisma.task.findFirst({
    where: { number: parsed.number, role: { taskPrefix: { equals: parsed.prefix, mode: "insensitive" } } },
    select: { id: true },
  });
  if (!task) throw new Error(`No task with key ${ref.trim().toUpperCase()}`);
  return task.id;
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_context",
      {
        title: "Get Conductor context",
        description:
          "Current snapshot: all roles, the active schedule block (which role is in focus right now), today's tasks, and follow-ups being waited on. Call this first to orient.",
        inputSchema: {},
      },
      async () => {
        const [roles, todayTasks, followUps, block] = await Promise.all([
          prisma.role.findMany({
            select: { id: true, name: true, title: true, priority: true },
            orderBy: { priority: "asc" },
          }),
          prisma.task.findMany({
            where: { scheduledFor: { lte: today() }, done: false },
            include: { role: { select: { name: true, taskPrefix: true } } },
            orderBy: [{ role: { priority: "asc" } }, { sortOrder: "asc" }],
          }),
          prisma.followUp.findMany({
            where: { status: "waiting" },
            include: { role: { select: { name: true, taskPrefix: true } } },
            orderBy: { createdAt: "asc" },
          }),
          getCurrentBlock(),
        ]);
        return ok({
          date: formatDateOnly(today()),
          currentBlock: block
            ? {
                label: block.block.label,
                time: getTimeLabel(block.block),
                role: roles.find((r) => r.id === block.roleId)?.name ?? null,
              }
            : null,
          roles: roles.map((r) => ({ name: r.name, title: r.title, priority: r.priority })),
          todayTasks: todayTasks.map(taskShape),
          waitingOn: followUps.map((f) => ({
            id: f.id,
            title: f.title,
            waitingOn: f.waitingOn,
            role: f.role?.name,
            daysSince: Math.floor((Date.now() - f.createdAt.getTime()) / 86400000),
          })),
        });
      }
    );

    server.registerTool(
      "list_tasks",
      {
        title: "List tasks",
        description: "List tasks, optionally filtered by role name, board status, or today's plan.",
        inputSchema: {
          role: z.string().optional().describe("Role name (partial ok) or role id"),
          status: z.enum(VALID_STATUSES).optional(),
          todayOnly: z.boolean().optional().describe("Only tasks scheduled for today or earlier"),
          includeDone: z.boolean().optional(),
        },
      },
      async ({ role, status, todayOnly, includeDone }) => {
        const where: Record<string, unknown> = {};
        if (!includeDone) where.done = false;
        if (role) where.roleId = (await resolveRole(role)).id;
        if (status) where.status = status;
        else where.status = { not: "icebox" };
        if (todayOnly) where.scheduledFor = { lte: today() };
        const tasks = await prisma.task.findMany({
          where,
          include: { role: { select: { name: true, priority: true, taskPrefix: true } } },
          orderBy: [{ role: { priority: "asc" } }, { sortOrder: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
          take: 50,
        });
        return ok(tasks.map(taskShape));
      }
    );

    server.registerTool(
      "get_meetings",
      {
        title: "Get meetings",
        description:
          "List calendar meetings for a single day or a date range. Covers a rolling ~14-day forward window (today through ~2 weeks out) plus any past day already synced. Dates are YYYY-MM-DD. Returns each meeting's time, title, company, and attendees. Note: only the macOS Calendar window that has been synced is available — meetings beyond ~2 weeks out are not yet stored.",
        inputSchema: {
          date: z.string().optional().describe("A single day, YYYY-MM-DD. Defaults to today. Ignored if from/to are given."),
          from: z.string().optional().describe("Range start (inclusive), YYYY-MM-DD"),
          to: z.string().optional().describe("Range end (inclusive), YYYY-MM-DD"),
          includeIgnored: z.boolean().optional().describe("Include ignored blocks (OOO, Lunch, Focus Time, etc.). Default false."),
        },
      },
      async ({ date, from, to, includeIgnored }) => {
        const where: Record<string, unknown> = { userHidden: false };
        if (from || to) {
          // date is a "YYYY-MM-DD" text column — lexicographic range == chronological range
          const range: Record<string, string> = {};
          if (from) range.gte = from;
          if (to) range.lte = to;
          where.date = range;
        } else {
          where.date = date || formatDateOnly(today());
        }
        if (!includeIgnored) where.isIgnored = false;
        const meetings = await prisma.meeting.findMany({
          where,
          include: { role: { select: { name: true, taskPrefix: true } } },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          take: 200,
        });
        return ok(
          meetings.map((m) => ({
            date: m.date,
            start: m.startTime,
            end: m.endTime,
            title: m.title,
            company: m.role?.name ?? null,
            attendees: m.attendees,
            ignored: m.isIgnored,
          }))
        );
      }
    );

    server.registerTool(
      "create_task",
      {
        title: "Create task",
        description:
          "Create a task in Conductor from natural language. By default the text is AI-refined into a proper task card (short title, details in notes, checklist, resolved due date) and, if no role is given, the right role/company is inferred from the role directory + staff names. If the result has needsClarification: true, the task was NOT created — ask the user which role/company they want, then call again with the role parameter. Defaults to the backlog — set isToday only when the user explicitly wants it on today's plan.",
        inputSchema: {
          text: z.string().min(1).describe("The todo in natural language — full context welcome, it gets refined"),
          role: z.string().optional().describe("Role/company name (partial ok) or role id. Omit to auto-infer."),
          priority: z.enum(["normal", "urgent"]).optional().describe("Override — otherwise inferred"),
          isToday: z.boolean().optional().describe("Put on today's plan instead of backlog"),
          dueDate: z.string().optional().describe("YYYY-MM-DD override — otherwise inferred from the text"),
          refine: z.boolean().optional().describe("Set false to skip AI refinement and save the text verbatim (role required)"),
        },
      },
      async ({ text, role, priority, isToday, dueDate, refine }) => {
        let resolved = role ? await resolveRole(role) : null;
        let refined: RefinedTask | null = null;
        let refineError: string | null = null;

        if (refine !== false) {
          try {
            refined = await refineTask({ rawText: text, roleId: resolved?.id, inferRole: !resolved });
            // Only trust the inferred role when the model had direct evidence
            if (!resolved && refined.role && refined.roleConfidence === "high") {
              resolved = await resolveRole(refined.role).catch(() => null) as Awaited<ReturnType<typeof resolveRole>> | null;
            }
          } catch (e) {
            refineError = e instanceof Error ? e.message : "refinement failed";
          }
        }

        // No confident role → don't guess. Hand the question back to the client.
        if (!resolved) {
          const [roles, block] = await Promise.all([
            prisma.role.findMany({ select: { id: true, name: true }, orderBy: { priority: "asc" } }),
            getCurrentBlock(),
          ]);
          const blockRoleName = block?.roleId ? roles.find((r) => r.id === block.roleId)?.name : undefined;
          return ok({
            needsClarification: true,
            question: "Which company/role should this task go to?",
            options: roles.map((r) => r.name),
            ...(refined?.role && refined.roleConfidence === "low" ? { bestGuess: refined.role } : {}),
            ...(blockRoleName ? { currentBlockRole: blockRoleName } : {}),
            draft: refined ? { title: refined.title, dueDate: refined.dueDate, priority: refined.priority } : { title: text },
            instruction:
              "Task NOT created. Ask the user which role/company this belongs to (offer bestGuess/currentBlockRole as suggestions if present), then call create_task again with the role parameter.",
          });
        }

        // No AI title (refine:false, or refinement failed)? Split it deterministically
        // rather than making the whole paragraph the title.
        const fallback = refined?.title ? null : splitRawTask(text);

        const task = await prisma.task.create({
          data: {
            roleId: resolved.id,
            title: refined?.title || fallback!.title,
            notes: refined?.notes || fallback?.notes || undefined,
            checklist: refined?.checklist || undefined,
            priority: priority || refined?.priority || "normal",
            status: "backlog",
            scheduledFor: isToday ? today() : null,
            dueDate: (dueDate || refined?.dueDate) ? new Date(`${dueDate || refined?.dueDate}T00:00:00`) : undefined,
            sourceType: "mcp",
          },
          include: { role: { select: { name: true, taskPrefix: true } } },
        });
        if (isToday) invalidateRebalanceCache();
        return ok({
          created: taskShape(task),
          roleWasInferred: !role,
          refined: !!refined,
          ...(fallback?.notes ? { titleShortened: "Long text split — title is the first sentence, full text is in notes" } : {}),
          ...(refineError ? { warning: `AI refinement unavailable (${refineError}) — saved verbatim` } : {}),
          ...(refined?.checklist?.length ? { checklist: refined.checklist.map((c) => c.text) } : {}),
        });
      }
    );

    server.registerTool(
      "update_task",
      {
        title: "Update task",
        description:
          "Update a task: move it on the board (status), mark it done, pull it into/out of today's plan, or edit fields. Accepts the task's human key (VQ-14, MED-54) or its id — both come back from list_tasks/search.",
        inputSchema: {
          taskId: z.string().describe('Task key like "VQ-14" or "MED-54" (preferred), or the raw id'),
          title: z.string().optional(),
          status: z.enum(VALID_STATUSES).optional(),
          done: z.boolean().optional(),
          priority: z.enum(["normal", "urgent"]).optional(),
          isToday: z.boolean().optional().describe("true = today's plan, false = back to backlog"),
          dueDate: z.string().nullable().optional().describe("YYYY-MM-DD, or null to clear"),
          notes: z.string().optional(),
          blockedReason: z.string().optional().describe('Why it is blocked, e.g. "waiting on Jeff to approve the slate". Set this whenever you set status to blocked — a blocked task with no reason is just a lost task.'),
          role: z.string().optional().describe("Move the task to a different role/company (name or id)"),
        },
      },
      async ({ taskId, title, status, done, priority, isToday, dueDate, notes, role, blockedReason }) => {
        const data: Record<string, unknown> = {};
        if (role !== undefined) data.roleId = (await resolveRole(role)).id;
        if (title !== undefined) data.title = title;
        if (status !== undefined) {
          data.status = status;
          // Mirror the REST route: blocking starts the resurface clock, anything
          // else clears it.
          if (status === "blocked") {
            data.blockedAt = new Date();
            if (blockedReason !== undefined) data.blockedReason = blockedReason || null;
          } else {
            data.blockedAt = null;
            data.blockedReason = null;
          }
        } else if (blockedReason !== undefined) {
          data.blockedReason = blockedReason || null;
        }
        if (priority !== undefined) data.priority = priority;
        if (notes !== undefined) data.notes = notes;
        if (done !== undefined) {
          data.done = done;
          if (done) data.doneAt = new Date();
        }
        if (isToday !== undefined) data.scheduledFor = isToday ? today() : null;
        if (dueDate !== undefined) data.dueDate = dueDate ? new Date(`${dueDate}T00:00:00`) : null;
        const task = await prisma.task.update({
          where: { id: await resolveTaskId(taskId) },
          data,
          include: { role: { select: { name: true, taskPrefix: true } } },
        });
        if (done !== undefined || isToday !== undefined) invalidateRebalanceCache();
        return ok({ updated: taskShape(task) });
      }
    );

    server.registerTool(
      "delete_task",
      {
        title: "Delete task",
        description:
          "Permanently delete a task. This is destructive and cannot be undone — for something you just want off the board, prefer update_task (mark done, or set status to icebox). Use delete only when the task was a mistake or the user explicitly asks to delete it. Accepts the task's key (VQ-14) or its id.",
        inputSchema: {
          taskId: z.string().describe('Task key like "VQ-14" (preferred), or the raw id'),
        },
      },
      async ({ taskId }) => {
        const resolvedId = await resolveTaskId(taskId).catch(() => null);
        const existing = resolvedId
          ? await prisma.task.findUnique({
              where: { id: resolvedId },
              include: { role: { select: { name: true, taskPrefix: true } } },
            })
          : null;
        if (!existing) return ok({ deleted: false, message: "No task with that key or id (already gone?)" });
        await prisma.task.delete({ where: { id: existing.id } });
        invalidateRebalanceCache();
        return ok({ deleted: true, key: taskKey(existing, existing.role), title: existing.title, company: existing.role?.name ?? null });
      }
    );

    server.registerTool(
      "create_followup",
      {
        title: "Create follow-up",
        description:
          "Track something you're waiting on from someone else. Follow-ups are NOT tasks — they live in the Tracker.",
        inputSchema: {
          role: z.string().describe("Role name (partial ok) or role id"),
          title: z.string().min(1).describe("What you're waiting for"),
          waitingOn: z.string().describe("Person you're waiting on"),
          dueDate: z.string().optional().describe("YYYY-MM-DD"),
        },
      },
      async ({ role, title, waitingOn, dueDate }) => {
        const r = await resolveRole(role);
        const followUp = await prisma.followUp.create({
          data: {
            roleId: r.id,
            title,
            waitingOn,
            dueDate: dueDate ? new Date(`${dueDate}T00:00:00`) : undefined,
            staleDays: 3,
            sourceType: "mcp",
          },
        });
        return ok({ created: { id: followUp.id, title: followUp.title, waitingOn: followUp.waitingOn, role: r.name } });
      }
    );

    server.registerTool(
      "add_note",
      {
        title: "Add note",
        description: "Save a note under a role — findings, decisions, context worth keeping.",
        inputSchema: {
          role: z.string().describe("Role name (partial ok) or role id"),
          content: z.string().min(1),
          tags: z.array(z.string()).optional(),
        },
      },
      async ({ role, content, tags }) => {
        const r = await resolveRole(role);
        const note = await prisma.note.create({
          data: { roleId: r.id, content, tags: tags || [] },
        });
        return ok({ created: { id: note.id, role: r.name } });
      }
    );

    server.registerTool(
      "format_message",
      {
        title: "Format message",
        description:
          "Rewrite a raw/draft message in the user's voice and tone for a specific role/company, with platform-correct formatting (Slack mrkdwn, Teams markdown, email HTML, or SMS plain text). Returns the formatted message verbatim — show it to the user exactly as returned, do not reformat it.",
        inputSchema: {
          text: z.string().min(1).describe("The raw message to reformat"),
          role: z.string().describe("Role/company name (partial ok) or role id — controls voice and tone"),
          format: z.enum(["slack", "teams", "email", "sms"]).optional().describe("Target platform, default slack"),
        },
      },
      async ({ text, role, format }) => {
        const r = await resolveRole(role);
        const formatted = await formatMessage({ roleId: r.id, rawMessage: text, format: format || "slack" });
        return { content: [{ type: "text" as const, text: formatted }] };
      }
    );

    server.registerTool(
      "search",
      {
        title: "Search Conductor",
        description:
          "Search tasks, follow-ups, notes, and transcripts by keyword, or look one up by its key (VQ-14, MED-54). Use before creating tasks to avoid duplicates.",
        inputSchema: { query: z.string().min(1) },
      },
      async ({ query }) => {
        const [tasks, followUps, notes, transcripts] = await Promise.all([
          prisma.task.findMany({
            // A key ("VQ-14", "MED-54", "G-105") finds that exact task; anything
            // else is a title search.
            where: {
              done: false,
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { externalKey: { equals: query.trim(), mode: "insensitive" } },
                ...(parseTaskKey(query)
                  ? [{
                      number: parseTaskKey(query)!.number,
                      role: { taskPrefix: { equals: parseTaskKey(query)!.prefix, mode: "insensitive" as const } },
                    }]
                  : []),
              ],
            },
            include: { role: { select: { name: true, taskPrefix: true } } },
            take: 10,
            orderBy: { createdAt: "desc" },
          }),
          prisma.followUp.findMany({
            where: { status: "waiting", title: { contains: query, mode: "insensitive" } },
            include: { role: { select: { name: true, taskPrefix: true } } },
            take: 10,
            orderBy: { createdAt: "desc" },
          }),
          prisma.note.findMany({
            where: { content: { contains: query, mode: "insensitive" } },
            include: { role: { select: { name: true, taskPrefix: true } } },
            take: 10,
            orderBy: { createdAt: "desc" },
          }),
          prisma.transcript.findMany({
            where: {
              OR: [
                { rawText: { contains: query, mode: "insensitive" } },
                { summary: { contains: query, mode: "insensitive" } },
              ],
            },
            include: { role: { select: { name: true, taskPrefix: true } } },
            take: 5,
            orderBy: { createdAt: "desc" },
          }),
        ]);
        return ok({
          tasks: tasks.map(taskShape),
          followUps: followUps.map((f) => ({ id: f.id, title: f.title, waitingOn: f.waitingOn, role: f.role?.name })),
          notes: notes.map((n) => ({ id: n.id, role: n.role?.name, preview: n.content.slice(0, 200) })),
          transcripts: transcripts.map((t) => ({
            id: t.id,
            role: t.role?.name,
            preview: (t.summary || t.rawText).slice(0, 200),
          })),
        });
      }
    );
  },
  {
    serverInfo: { name: "conductor", version: "1.0.0" },
    capabilities: { tools: {} },
  },
  {
    basePath: "/api/mcp",
    maxDuration: 60,
    verboseLogs: false,
  }
);

const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  const expected = process.env.MCP_API_TOKEN;
  if (!expected || !bearerToken) return undefined;
  const a = createHash("sha256").update(bearerToken).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) return undefined;
  return { token: bearerToken, scopes: ["conductor"], clientId: "claude-code" };
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST };
