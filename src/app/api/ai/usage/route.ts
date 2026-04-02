import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const records = await prisma.aiUsage.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });

  // Aggregate by day
  const byDay: Record<string, { costCents: number; calls: number }> = {};
  // Aggregate by endpoint
  const byEndpoint: Record<string, { costCents: number; calls: number; inputTokens: number; outputTokens: number }> = {};
  // Aggregate by role
  const byRole: Record<string, { costCents: number; calls: number }> = {};

  let totalCostCents = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const r of records) {
    const dayKey = r.createdAt.toISOString().slice(0, 10);

    if (!byDay[dayKey]) byDay[dayKey] = { costCents: 0, calls: 0 };
    byDay[dayKey].costCents += r.costCents;
    byDay[dayKey].calls += 1;

    if (!byEndpoint[r.endpoint]) byEndpoint[r.endpoint] = { costCents: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
    byEndpoint[r.endpoint].costCents += r.costCents;
    byEndpoint[r.endpoint].calls += 1;
    byEndpoint[r.endpoint].inputTokens += r.inputTokens;
    byEndpoint[r.endpoint].outputTokens += r.outputTokens;

    const roleKey = r.roleId || "unknown";
    if (!byRole[roleKey]) byRole[roleKey] = { costCents: 0, calls: 0 };
    byRole[roleKey].costCents += r.costCents;
    byRole[roleKey].calls += 1;

    totalCostCents += r.costCents;
    totalInputTokens += r.inputTokens;
    totalOutputTokens += r.outputTokens;
  }

  // Today / this week / this month
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const todayCents = byDay[todayKey]?.costCents || 0;
  const weekCents = records.filter((r) => r.createdAt >= weekAgo).reduce((s, r) => s + r.costCents, 0);
  const monthCents = records.filter((r) => r.createdAt >= monthAgo).reduce((s, r) => s + r.costCents, 0);

  // Recent calls (last 50)
  const recent = records.slice(0, 50).map((r) => ({
    id: r.id,
    endpoint: r.endpoint,
    roleId: r.roleId,
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costCents: r.costCents,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({
    totalCostCents,
    totalInputTokens,
    totalOutputTokens,
    totalCalls: records.length,
    todayCents,
    weekCents,
    monthCents,
    byDay,
    byEndpoint,
    byRole,
    recent,
  });
}
