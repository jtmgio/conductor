import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { trackUsage } from "@/lib/ai-usage";
import { getAnthropicApiKey } from "@/lib/api-keys";

const GRANOLA_API = "https://public-api.granola.ai/v1";

// Folder-to-role mapping built dynamically from active roles

interface GranolaNote {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  owner: { name: string; email: string };
  folder?: { id: string; name: string } | null;
}

interface GranolaNoteWithTranscript extends GranolaNote {
  transcript: Array<{ speaker: { source: string; name?: string }; text: string }>;
}

async function fetchRecentNotes(apiKey: string, since: Date): Promise<GranolaNote[]> {
  const allNotes: GranolaNote[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ created_after: since.toISOString() });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${GRANOLA_API}/notes?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Granola API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    allNotes.push(...(data.notes || []));
    hasMore = data.hasMore || false;
    cursor = data.cursor || null;

    if (allNotes.length > 200) break;
  }

  return allNotes;
}

async function fetchNoteWithTranscript(apiKey: string, noteId: string): Promise<GranolaNoteWithTranscript> {
  const res = await fetch(`${GRANOLA_API}/notes/${noteId}?include=transcript`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Granola API error fetching note ${noteId}: ${res.status}`);
  }

  return res.json();
}

function matchRole(folderName: string | null | undefined, roleMapping: Record<string, string>, folderMap: Record<string, string>): string | null {
  if (!folderName) return null;

  // Configured folder mappings first (exact)
  if (folderMap[folderName]) return folderMap[folderName];

  // Case-insensitive folder map
  const lower = folderName.toLowerCase();
  for (const [name, roleId] of Object.entries(folderMap)) {
    if (name.toLowerCase() === lower) return roleId;
  }

  // Fallback: match folder name against role names
  if (roleMapping[folderName]) return roleMapping[folderName];
  for (const [name, roleId] of Object.entries(roleMapping)) {
    if (name.toLowerCase() === lower) return roleId;
  }

  return null;
}

export async function POST(_req: NextRequest) {
  const anthropicApiKey = await getAnthropicApiKey();
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const apiKey = process.env.GRANOLA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GRANOLA_API_KEY not configured" }, { status: 500 });
  }

  const integration = await prisma.integration.findUnique({ where: { type: "granola" } });
  const folderMap: Record<string, string> = (integration?.config as { folderMap?: Record<string, string> })?.folderMap || {};
  const since = integration?.lastSyncAt || new Date(Date.now() - 2 * 60 * 60 * 1000);

  // Build role name → role ID mapping from active roles (fallback for unmapped folders)
  const activeRoles = await prisma.role.findMany({ where: { active: true } });
  const roleMapping: Record<string, string> = {};
  for (const role of activeRoles) {
    roleMapping[role.name] = role.id;
  }

  let notes: GranolaNote[];
  try {
    notes = await fetchRecentNotes(apiKey, since);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let processed = 0;
  let skipped = 0;
  let noFolder = 0;
  const results: Array<{ note: string; role: string; tasks: number; followUps: number }> = [];

  const roles = await prisma.role.findMany({
    include: { staff: { select: { name: true, title: true } } },
  });
  const roleStaffMap = Object.fromEntries(
    roles.map((r) => [r.id, r.staff.map((s) => `${s.name} (${s.title})`).join(", ")])
  );

  for (const note of notes) {
    const roleId = matchRole(note.folder?.name, roleMapping, folderMap);

    if (!roleId) {
      noFolder++;
      continue;
    }

    // Dedup via task sourceId
    const existingTask = await prisma.task.findFirst({
      where: { sourceType: "granola", sourceId: `granola-${note.id}` },
    });
    if (existingTask) {
      skipped++;
      continue;
    }

    // Dedup via transcript marker
    const existingTranscript = await prisma.transcript.findFirst({
      where: { rawText: { startsWith: `[granola:${note.id}]` } },
    });
    if (existingTranscript) {
      skipped++;
      continue;
    }

    let fullNote: GranolaNoteWithTranscript;
    try {
      fullNote = await fetchNoteWithTranscript(apiKey, note.id);
    } catch (err) {
      console.error(`Failed to fetch Granola note ${note.id}:`, err);
      skipped++;
      continue;
    }

    const transcriptText =
      fullNote.transcript
        ?.map((t) => {
          const speaker = t.speaker?.name || t.speaker?.source || "Unknown";
          return `${speaker}: ${t.text}`;
        })
        .join("\n") || "";

    const contentForExtraction = fullNote.summary
      ? `AI Summary:\n${fullNote.summary}\n\nFull Transcript:\n${transcriptText.slice(0, 6000)}`
      : transcriptText.slice(0, 8000);

    if (contentForExtraction.trim().length < 50) {
      skipped++;
      continue;
    }

    // Store raw content as transcript
    await prisma.transcript.create({
      data: {
        roleId,
        rawText: `[granola:${note.id}] ${contentForExtraction}`,
        summary: fullNote.summary || null,
      },
    });

    const role = roles.find((r) => r.id === roleId);
    const staffContext = roleStaffMap[roleId] || "none";

    try {
      const extractRes = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: `You are extracting action items from meeting notes for the ${role?.name || roleId} role (${role?.title || ""}).

Known team members for this role:
${staffContext}

Rules:
- When someone is assigned an action item or owes a deliverable, create a follow-up with their exact name in "waitingOn"
- When JG (the user) has an action item, create a task
- When a decision is made, capture it as a decision
- Use specific, actionable titles — not vague descriptions
- Mark genuinely time-sensitive items as "urgent", everything else as "normal"

Return ONLY valid JSON, no markdown backticks:
{
  "summary": "2-3 sentence summary",
  "tasks": [{"title": "specific action item for JG", "priority": "normal|urgent"}],
  "followUps": [{"title": "what is owed", "waitingOn": "person name"}],
  "decisions": [{"summary": "decision that was made"}]
}`,
        messages: [
          {
            role: "user",
            content: `Meeting: ${note.title}\nDate: ${note.created_at}\nRole: ${role?.name || roleId}\n\n${contentForExtraction}`,
          },
        ],
      });

      trackUsage("granola-sync", extractRes.model, extractRes.usage, roleId);

      const text = extractRes.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const extracted = JSON.parse(text.replace(/```json|```/g, "").trim());

      // Create tasks
      let taskCount = 0;
      for (const task of extracted.tasks || []) {
        const created = await prisma.task.create({
          data: {
            roleId,
            title: task.title,
            priority: task.priority || "normal",
            status: "backlog",
            sourceType: "granola",
            sourceId: `granola-${note.id}`,
            notes: `Meeting: ${note.title}\nDate: ${new Date(note.created_at).toLocaleDateString()}\n\n${extracted.summary || ""}`,
          },
        });

        const meetingTag = await prisma.tag.upsert({
          where: { name: "meeting" },
          update: {},
          create: { name: "meeting", color: "#a78bfa" },
        });
        await prisma.taskTag.create({ data: { taskId: created.id, tagId: meetingTag.id } }).catch(() => {});
        taskCount++;
      }

      // Create follow-ups
      let fuCount = 0;
      for (const fu of extracted.followUps || []) {
        await prisma.followUp.create({
          data: {
            roleId,
            title: fu.title,
            waitingOn: fu.waitingOn,
            sourceType: "granola",
            sourceId: `granola-${note.id}`,
          },
        });
        fuCount++;
      }

      // Store decisions + summary as notes
      if (extracted.decisions?.length > 0 || extracted.summary) {
        await prisma.note.create({
          data: {
            roleId,
            content: [
              `Meeting: ${note.title}`,
              `Date: ${new Date(note.created_at).toLocaleDateString()}`,
              `Folder: ${note.folder?.name || "none"}`,
              "",
              extracted.summary || "",
              "",
              ...(extracted.decisions || []).map((d: { summary: string }) => `Decision: ${d.summary}`),
            ]
              .filter(Boolean)
              .join("\n"),
            tags: ["meeting", "granola", roleId],
          },
        });
      }

      // Update transcript with summary
      await prisma.transcript.updateMany({
        where: { rawText: { startsWith: `[granola:${note.id}]` } },
        data: { summary: extracted.summary || `${taskCount} tasks, ${fuCount} follow-ups` },
      });

      results.push({ note: note.title, role: role?.name || roleId, tasks: taskCount, followUps: fuCount });
      processed++;
    } catch (err) {
      console.error(`Failed to extract from Granola note "${note.title}":`, err);
      skipped++;
    }
  }

  const resultSummary = [
    `${processed} processed`,
    skipped > 0 ? `${skipped} skipped` : null,
    noFolder > 0 ? `${noFolder} no folder` : null,
    results.length > 0
      ? results.map((r) => `${r.note} [${r.role}]: ${r.tasks}T/${r.followUps}F`).join(", ")
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  await prisma.integration.upsert({
    where: { type: "granola" },
    update: { lastSyncAt: new Date(), lastSyncResult: `success: ${resultSummary}` },
    create: {
      type: "granola",
      roleId: activeRoles[0]?.id || "",
      config: { folderMap },
      enabled: true,
      lastSyncAt: new Date(),
      lastSyncResult: `success: ${resultSummary}`,
    },
  });

  return NextResponse.json({
    success: true,
    found: notes.length,
    processed,
    skipped,
    noFolder,
    results,
  });
}
