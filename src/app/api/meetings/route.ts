import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const localStr = now.toLocaleString("en-US", { timeZone: process.env.TIMEZONE || "America/New_York" });
  const today = new Date(localStr).toISOString().split("T")[0];

  const meetings = await prisma.meeting.findMany({
    where: { date: today, isIgnored: false, userHidden: false },
    include: {
      role: { select: { id: true, name: true, color: true } },
      prepTask: { select: { id: true, title: true, done: true } },
    },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(meetings);
}
