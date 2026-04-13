import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processFile, getStoragePath, MAX_FILE_SIZE, getUploadDir } from "@/lib/file-processor";
import { prisma } from "@/lib/prisma";
import { summarizeAndSaveToNote } from "@/lib/document-processor";
import fs from "fs/promises";

export async function POST(req: NextRequest, { params }: { params: { roleId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  await fs.mkdir(getUploadDir(), { recursive: true });
  const storagePath = getStoragePath(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storagePath, buffer);

  const { text, base64 } = await processFile(storagePath, file.type);

  // Save as FileUpload record for download + tracking
  let fileUploadId: string | null = null;
  if (params.roleId) {
    try {
      const upload = await prisma.fileUpload.create({
        data: {
          roleId: params.roleId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          storagePath,
          extractedText: text?.slice(0, 50000) || null,
        },
      });
      fileUploadId = upload.id;
    } catch {
      // Non-critical
    }
  }

  // Auto-save extracted text as a Note for long-term AI context retrieval
  if (text && text.length > 50 && params.roleId) {
    try {
      const note = await prisma.note.create({
        data: {
          roleId: params.roleId,
          content: `[Uploaded: ${file.name}]${fileUploadId ? `[FileID: ${fileUploadId}]` : ""}\n\n${text.slice(0, 50000)}`,
          tags: ["upload", file.name.split(".").pop() || "file"],
        },
      });
      // Fire-and-forget AI summary generation
      if (text.length > 500) {
        summarizeAndSaveToNote(note.id, text, file.name, params.roleId);
      }
    } catch {
      // Non-critical
    }
  }

  return NextResponse.json({
    filename: file.name,
    mimeType: file.type,
    text,
    base64,
  });
}
