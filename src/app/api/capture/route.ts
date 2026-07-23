import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refineTask, type RefinedTask } from "@/lib/task-refine";
import { getCurrentBlock } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/**
 * Simple REST capture endpoint for external one-shot clients (iOS Siri Shortcut,
 * home-screen widget). Unlike the MCP endpoint (which speaks the MCP protocol),
 * this is a plain bearer-authed POST a Shortcut can call directly.
 *
 *   POST /api/capture
 *   Authorization: Bearer $MCP_API_TOKEN
 *   { "text": "reply to dana about the sailthru scores by friday" }
 *   -> { ok, title, company }
 *
 * Same MLX refine + role inference as MCP create_task. Since a Shortcut can't answer
 * a clarifying question, an unconfident company falls back to the current schedule
 * block's company, then the top-priority company. The response says where it landed
 * so the Shortcut can read it back ("Added to Zeta").
 */
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = process.env.MCP_API_TOKEN;
  if (!expected || token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  let refined: RefinedTask | null = null;
  try {
    refined = await refineTask({ rawText: text, inferRole: true });
  } catch {
    // MLX unavailable — save verbatim below
  }

  // Resolve company: confident inference → current block → top-priority.
  let roleId: string | null = null;
  if (refined?.role && refined.roleConfidence === "high") {
    const roles = await prisma.role.findMany({ select: { id: true, name: true } });
    const n = refined.role.toLowerCase();
    const hit =
      roles.find((r) => r.name.toLowerCase() === n) ||
      roles.find((r) => r.name.toLowerCase().includes(n) || n.includes(r.name.toLowerCase()));
    roleId = hit?.id ?? null;
  }
  if (!roleId) {
    const block = await getCurrentBlock();
    roleId = block?.roleId ?? null;
  }
  if (!roleId) {
    const top = await prisma.role.findFirst({ where: { active: true }, orderBy: { priority: "asc" }, select: { id: true } });
    roleId = top?.id ?? null;
  }
  if (!roleId) return NextResponse.json({ error: "No company to file under" }, { status: 400 });

  const task = await prisma.task.create({
    data: {
      roleId,
      title: refined?.title || text,
      notes: refined?.notes || undefined,
      checklist: refined?.checklist || undefined,
      priority: refined?.priority || "normal",
      status: "backlog",
      dueDate: refined?.dueDate ? new Date(`${refined.dueDate}T00:00:00`) : undefined,
      sourceType: "siri",
    },
    include: { role: { select: { name: true } } },
  });

  return NextResponse.json({ ok: true, title: task.title, company: task.role.name });
}
