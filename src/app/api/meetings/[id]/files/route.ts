import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processFile, getStoragePath, MAX_FILE_SIZE, getUploadDir } from "@/lib/file-processor";
import fs from "fs/promises";
import path from "path";

// GET — list files attached to a meeting
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meetingFiles = await prisma.meetingFile.findMany({
    where: { meetingId: params.id },
    include: {
      file: {
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      },
    },
    orderBy: { file: { createdAt: "desc" } },
  });

  return NextResponse.json(meetingFiles.map((mf) => mf.file));
}

// POST — upload a new file and attach to meeting
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meeting = await prisma.meeting.findUnique({ where: { id: params.id }, select: { id: true, roleId: true } });
  if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });

  await fs.mkdir(getUploadDir(), { recursive: true });
  const storagePath = getStoragePath(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storagePath, buffer);

  const { text } = await processFile(storagePath, file.type);

  const upload = await prisma.fileUpload.create({
    data: {
      roleId: meeting.roleId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      storagePath: path.relative(getUploadDir(), storagePath),
      extractedText: text ? text.slice(0, 50000) : null,
    },
  });

  await prisma.meetingFile.create({
    data: { meetingId: params.id, fileId: upload.id },
  });

  return NextResponse.json({
    id: upload.id,
    filename: upload.filename,
    mimeType: upload.mimeType,
    size: upload.size,
    createdAt: upload.createdAt,
  });
}

// DELETE — detach a file from meeting
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileId } = await req.json();
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  await prisma.meetingFile.delete({
    where: { meetingId_fileId: { meetingId: params.id, fileId } },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
