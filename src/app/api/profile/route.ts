import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let profile = await prisma.userProfile.findUnique({ where: { id: "default" } });
  if (!profile) {
    profile = await prisma.userProfile.create({ data: { id: "default" } });
  }
  return NextResponse.json(profile);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { communicationStyle, sampleMessages, globalContext, calendarIgnorePatterns } = await req.json();

  const profile = await prisma.userProfile.upsert({
    where: { id: "default" },
    update: {
      ...(communicationStyle !== undefined && { communicationStyle }),
      ...(sampleMessages !== undefined && { sampleMessages }),
      ...(globalContext !== undefined && { globalContext }),
      ...(calendarIgnorePatterns !== undefined && { calendarIgnorePatterns }),
    },
    create: {
      id: "default",
      communicationStyle,
      sampleMessages,
      globalContext,
      calendarIgnorePatterns,
    },
  });

  return NextResponse.json(profile);
}
