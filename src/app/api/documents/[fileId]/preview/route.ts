import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { fileId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.fileUpload.findUnique({
    where: { id: params.fileId },
    select: { id: true, filename: true, mimeType: true, size: true, extractedText: true, createdAt: true },
  });

  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  return NextResponse.json(file);
}
