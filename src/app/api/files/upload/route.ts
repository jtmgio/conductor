import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processFile, getStoragePath, MAX_FILE_SIZE, getUploadDir } from "@/lib/file-processor";
import { summarizeAndSaveToNote } from "@/lib/document-processor";
import fs from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const roleId = formData.get("roleId") as string | null;

  if (!file || !roleId) {
    return NextResponse.json({ error: "file and roleId required" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  await fs.mkdir(getUploadDir(), { recursive: true });
  const storagePath = getStoragePath(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storagePath, buffer);

  const { text, base64 } = await processFile(storagePath, file.type);

  const upload = await prisma.fileUpload.create({
    data: {
      roleId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      storagePath: path.relative(getUploadDir(), storagePath),
      extractedText: text,
    },
  });

  // Auto-save as Note for long-term AI context retrieval
  if (text && text.length > 50) {
    try {
      const note = await prisma.note.create({
        data: {
          roleId,
          content: `[Uploaded: ${file.name}][FileID: ${upload.id}]\n\n${text.slice(0, 50000)}`,
          tags: ["upload", file.name.split(".").pop() || "file"],
        },
      });
      // Fire-and-forget AI summary generation
      if (text.length > 500) {
        summarizeAndSaveToNote(note.id, text, file.name, roleId);
      }
    } catch {
      // Non-critical
    }
  }

  return NextResponse.json({ ...upload, base64 });
}
