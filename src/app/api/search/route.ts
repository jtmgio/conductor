import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseTaskKey } from "@/lib/task-key";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ tasks: [], followUps: [], notes: [], transcripts: [] });

  const [tasks, followUps, notes, transcripts] = await Promise.all([
    prisma.task.findMany({
      // Typing a key ("WRI-12", "MED-54") jumps straight to that task; anything
      // else is a title search.
      where: {
        done: false,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { externalKey: { equals: q, mode: "insensitive" } },
          ...(parseTaskKey(q)
            ? [{
                number: parseTaskKey(q)!.number,
                role: { taskPrefix: { equals: parseTaskKey(q)!.prefix, mode: "insensitive" as const } },
              }]
            : []),
        ],
      },
      include: { role: { select: { id: true, name: true, color: true, taskPrefix: true } } },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.followUp.findMany({
      where: { status: "waiting", title: { contains: q, mode: "insensitive" } },
      include: { role: { select: { id: true, name: true, color: true } } },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.note.findMany({
      where: { content: { contains: q, mode: "insensitive" } },
      include: { role: { select: { id: true, name: true, color: true } } },
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
      include: { role: { select: { id: true, name: true, color: true } } },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    tasks,
    followUps,
    notes: notes.map((n) => ({ ...n, content: n.content.slice(0, 200) })),
    transcripts: transcripts.map((t) => ({
      ...t,
      rawText: undefined,
      preview: (t.summary || t.rawText).slice(0, 200),
    })),
  });
}
