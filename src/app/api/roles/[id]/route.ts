import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await prisma.role.findUnique({
    where: { id: params.id },
    include: { staff: true },
  });
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(role);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  // Allow updating all role fields
  const fields = ["name", "title", "platform", "color", "priority", "tone", "context", "responsibilities", "quarterlyGoals", "active", "aiRecentNotesCount", "aiRecentTranscriptsCount", "aiConversationHistoryLimit", "aiNoteChunkSize", "aiTranscriptChunkSize", "aiPinnedNoteChunkSize"];
  for (const field of fields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }

  const role = await prisma.role.update({
    where: { id: params.id },
    data: updateData,
  });
  return NextResponse.json(role);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Soft-delete: set active = false
  const role = await prisma.role.update({
    where: { id: params.id },
    data: { active: false },
  });
  return NextResponse.json(role);
}
