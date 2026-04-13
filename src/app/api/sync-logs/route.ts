import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // "linear", "granola", "calendar", or null for all
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  const logs = await prisma.syncLog.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(logs);
}
