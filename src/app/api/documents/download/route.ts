import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");
  const noteId = searchParams.get("noteId");

  // Download from FileUpload record (original file)
  if (fileId) {
    const file = await prisma.fileUpload.findUnique({ where: { id: fileId } });
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

    try {
      const buffer = await fs.readFile(file.storagePath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
          "Content-Length": String(buffer.length),
        },
      });
    } catch {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }
  }

  // Fallback: download from Note (extracted text as .txt)
  if (noteId) {
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

    // Check if the note has a FileID reference
    const fileIdMatch = note.content.match(/\[FileID: (.+?)\]/);
    if (fileIdMatch) {
      const linkedFile = await prisma.fileUpload.findUnique({ where: { id: fileIdMatch[1] } });
      if (linkedFile) {
        try {
          const buffer = await fs.readFile(linkedFile.storagePath);
          return new NextResponse(buffer, {
            headers: {
              "Content-Type": linkedFile.mimeType || "application/octet-stream",
              "Content-Disposition": `attachment; filename="${encodeURIComponent(linkedFile.filename)}"`,
              "Content-Length": String(buffer.length),
            },
          });
        } catch {
          // File missing on disk, fall through to text download
        }
      }
    }

    // No linked file — serve extracted text
    const filenameMatch = note.content.match(/^\[Uploaded: (.+?)\]/);
    const filename = filenameMatch ? filenameMatch[1].replace(/\.[^.]+$/, ".txt") : "document.txt";
    const textContent = note.content.replace(/^\[Uploaded: .+?\](\[FileID: .+?\])?\n\n/, "");

    return new NextResponse(textContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  }

  return NextResponse.json({ error: "fileId or noteId required" }, { status: 400 });
}
