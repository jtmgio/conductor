import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logSync } from "@/lib/sync-logger";
import {
  GranolaNote,
  GranolaNoteWithTranscript,
  getApiKey,
  fetchRecentNotes,
  fetchNoteWithTranscript,
  resolveRole,
  buildTranscriptContent,
} from "@/lib/granola";

export async function POST(req: NextRequest) {
  const syncStart = new Date();

  let apiKey: string;
  try {
    apiKey = await getApiKey();
  } catch {
    return NextResponse.json({ error: "Granola API key not configured" }, { status: 500 });
  }

  const integration = await prisma.integration.findUnique({ where: { type: "granola" } });
  const folderMap: Record<string, string> = (integration?.config as { folderMap?: Record<string, string> })?.folderMap || {};

  // Allow date range override via query params
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam
    ? new Date(sinceParam)
    : integration?.lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Build role lookups
  const activeRoles = await prisma.role.findMany({ where: { active: true }, orderBy: { priority: "asc" } });
  const roleNameMap: Record<string, string> = {};
  for (const role of activeRoles) {
    roleNameMap[role.name] = role.id;
  }
  const fallbackRoleId = activeRoles[0]?.id || null;

  let notes: GranolaNote[];
  try {
    notes = await fetchRecentNotes(apiKey, since);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let processed = 0;
  let skipped = 0;
  let unmapped = 0;
  const results: Array<{ note: string; role: string }> = [];

  const debugNotes: Array<Record<string, unknown>> = [];

  for (const note of notes) {
    // Log full note structure for debugging
    const { transcript, ...noteWithoutTranscript } = note as unknown as Record<string, unknown>;
    debugNotes.push(noteWithoutTranscript);
    console.log(`[granola-sync] Note: "${note.title}" | Raw data:`, JSON.stringify(noteWithoutTranscript, null, 2));

    // Dedup: check if we already have this note (old task-based or new transcript-based)
    const [existingTask, existingTranscript] = await Promise.all([
      prisma.task.findFirst({ where: { sourceType: "granola", sourceId: `granola-${note.id}` } }),
      prisma.transcript.findFirst({ where: { sourceId: `granola-${note.id}` } }),
    ]);
    if (existingTask || existingTranscript) {
      skipped++;
      continue;
    }

    // Fetch full note with transcript — this has folder_membership data
    let fullNote: GranolaNoteWithTranscript;
    try {
      fullNote = await fetchNoteWithTranscript(apiKey, note.id);
    } catch (err) {
      console.error(`[granola-sync] Failed to fetch note ${note.id}:`, err);
      skipped++;
      continue;
    }

    // Resolve role from full note's folder_membership (list endpoint doesn't include it)
    const folderName = fullNote.folder_membership?.[0]?.name || note.folder?.name || null;
    const roleId = resolveRole(folderName, folderMap, roleNameMap, fallbackRoleId);

    if (!roleId) {
      unmapped++;
      continue;
    }

    const content = buildTranscriptContent(fullNote);
    if (content.trim().length < 50) {
      skipped++;
      continue;
    }

    // Save as pending transcript — user reviews in Inbox
    // Use the Granola meeting date, not now()
    await prisma.transcript.create({
      data: {
        roleId,
        title: note.title || `Granola meeting (${new Date(note.created_at).toLocaleDateString()})`,
        rawText: content,
        summary: fullNote.summary || null,
        sourceType: "granola",
        sourceId: `granola-${note.id}`,
        createdAt: new Date(note.created_at),
      },
    });

    const roleName = activeRoles.find((r) => r.id === roleId)?.name || roleId;
    results.push({ note: note.title, role: roleName });
    processed++;
  }

  const summaryParts = [
    `${processed} new`,
    skipped > 0 ? `${skipped} skipped` : null,
    unmapped > 0 ? `${unmapped} unmapped` : null,
  ].filter(Boolean).join(", ");

  const detailParts = results.map((r) => `${r.note} [${r.role}]`).join(", ");
  const resultSummary = detailParts ? `${summaryParts} — ${detailParts}` : summaryParts;

  await prisma.integration.upsert({
    where: { type: "granola" },
    update: { lastSyncAt: new Date(), lastSyncResult: resultSummary },
    create: {
      type: "granola",
      roleId: fallbackRoleId || "",
      config: { folderMap },
      enabled: true,
      lastSyncAt: new Date(),
      lastSyncResult: resultSummary,
    },
  });

  await logSync({
    type: "granola",
    trigger: "manual",
    status: processed > 0 ? "success" : "partial",
    summary: resultSummary,
    itemsFound: notes.length,
    itemsCreated: processed,
    itemsSkipped: skipped + unmapped,
    startedAt: syncStart,
    meta: results.length > 0 ? { results } : undefined,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    summary: resultSummary,
    found: notes.length,
    processed,
    skipped,
    unmapped,
    results,
    debug: debugNotes,
  });
}
