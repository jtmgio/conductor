import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCompletion } from "@/lib/ai-provider";
import { trackUsage } from "@/lib/ai-usage";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query } = await req.json();
  if (!query?.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const q = query.trim();

  // Run keyword search across all content types
  const [tasks, followUps, notes, transcripts] = await Promise.all([
    prisma.task.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      include: { role: { select: { id: true, name: true } } },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.followUp.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      include: { role: { select: { id: true, name: true } } },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.note.findMany({
      where: { content: { contains: q, mode: "insensitive" } },
      include: { role: { select: { id: true, name: true } } },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.transcript.findMany({
      where: {
        OR: [
          { rawText: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
        ],
      },
      include: { role: { select: { id: true, name: true } } },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  type SearchResult = { type: string; title: string; roleId: string; roleName: string; content: string };
  const results: SearchResult[] = [];

  for (const t of tasks) {
    results.push({ type: "task", title: t.title, roleId: t.role.id, roleName: t.role.name, content: `Task: "${t.title}" (status: ${t.status}, priority: ${t.priority})` });
  }
  for (const f of followUps) {
    results.push({ type: "follow-up", title: f.title, roleId: f.role.id, roleName: f.role.name, content: `Follow-up: "${f.title}" (waiting on: ${f.waitingOn}, status: ${f.status})` });
  }
  for (const n of notes) {
    results.push({ type: "note", title: n.content.slice(0, 80), roleId: n.role.id, roleName: n.role.name, content: `Note (${n.role.name}): ${n.content.slice(0, 300)}` });
  }
  for (const t of transcripts) {
    const preview = (t.summary || t.rawText).slice(0, 100);
    results.push({ type: "transcript", title: preview, roleId: t.role.id, roleName: t.role.name, content: `Transcript: ${(t.summary || t.rawText).slice(0, 300)}` });
  }

  const topResults = results.slice(0, 10);

  if (topResults.length === 0) {
    return NextResponse.json({
      answer: `No results found for "${q}". Try a different search term.`,
      sources: [],
    });
  }

  const resultsText = topResults
    .map((r, i) => `[${i + 1}] (${r.type}, ${r.roleName}) ${r.content}`)
    .join("\n");

  const response = await createCompletion({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: "Based on these search results from the user's productivity system, answer their question. Cite which source (task, note, follow-up, transcript) your answer comes from. If the results don't contain enough info, say so.",
    messages: [{ role: "user", content: `Question: ${q}\n\nSearch results:\n${resultsText}` }],
  });

  trackUsage("search_ai", response.model, response.usage);

  const sources = topResults.map((r) => ({
    type: r.type,
    title: r.title,
    roleId: r.roleId,
  }));

  return NextResponse.json({ answer: response.text, sources });
}
