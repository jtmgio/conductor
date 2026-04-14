import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processFile, getStoragePath, MAX_FILE_SIZE, getUploadDir } from "@/lib/file-processor";
import fs from "fs/promises";
import path from "path";

// GET — list files attached to a task
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const taskFiles = await prisma.taskFile.findMany({
    where: { taskId: params.id },
    include: {
      file: {
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      },
    },
    orderBy: { file: { createdAt: "desc" } },
  });

  return NextResponse.json(taskFiles.map((tf) => tf.file));
}

// POST — upload a new file and attach to task, or attach an existing file
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await prisma.task.findUnique({ where: { id: params.id }, select: { id: true, roleId: true } });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") || "";

  // JSON body: attach an existing file by ID
  if (contentType.includes("application/json")) {
    const { fileId } = await req.json();
    if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

    const file = await prisma.fileUpload.findUnique({ where: { id: fileId } });
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

    // Upsert to avoid duplicates
    await prisma.taskFile.upsert({
      where: { taskId_fileId: { taskId: params.id, fileId } },
      update: {},
      create: { taskId: params.id, fileId },
    });

    return NextResponse.json(file);
  }

  // FormData: upload new file and attach
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
      roleId: task.roleId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      storagePath: path.relative(getUploadDir(), storagePath),
      extractedText: text ? text.slice(0, 50000) : null,
    },
  });

  // Link to task
  await prisma.taskFile.create({
    data: { taskId: params.id, fileId: upload.id },
  });

  return NextResponse.json({
    id: upload.id,
    filename: upload.filename,
    mimeType: upload.mimeType,
    size: upload.size,
    createdAt: upload.createdAt,
  });
}

// DELETE — detach a file from task (does not delete the file itself)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileId } = await req.json();
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  await prisma.taskFile.delete({
    where: { taskId_fileId: { taskId: params.id, fileId } },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
