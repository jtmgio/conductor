import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface DocumentItem {
  id: string;
  source: "note" | "file";
  filename: string;
  roleName: string;
  roleId: string;
  roleColor: string;
  fileType: string;
  contentLength: number;
  preview: string;
  summary: string | null;
  pinned: boolean;
  createdAt: string;
  fileUploadId: string | null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const roleId = searchParams.get("roleId");
  const query = searchParams.get("q");

  // Get all roles for name/color mapping
  const roles = await prisma.role.findMany({ where: { active: true } });
  const roleMap = Object.fromEntries(roles.map((r) => [r.id, { name: r.name, color: r.color }]));

  // Query upload-tagged notes
  const noteWhere: Record<string, unknown> = {
    tags: { has: "upload" },
  };
  if (roleId) noteWhere.roleId = roleId;
  if (query) noteWhere.content = { contains: query, mode: "insensitive" };

  const uploadNotes = await prisma.note.findMany({
    where: noteWhere,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Query FileUpload records
  const fileWhere: Record<string, unknown> = {};
  if (roleId) fileWhere.roleId = roleId;
  if (query) {
    fileWhere.OR = [
      { filename: { contains: query, mode: "insensitive" } },
      { extractedText: { contains: query, mode: "insensitive" } },
    ];
  }

  const fileUploads = await prisma.fileUpload.findMany({
    where: fileWhere,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Merge into unified list
  const docs: DocumentItem[] = [];

  for (const note of uploadNotes) {
    // Extract filename from content "[Uploaded: filename.ext][FileID: xxx]\n\n..."
    const match = note.content.match(/^\[Uploaded: (.+?)\]/);
    const filename = match ? match[1] : "Unknown file";
    const fileIdMatch = note.content.match(/\[FileID: (.+?)\]/);
    const fileUploadId = fileIdMatch ? fileIdMatch[1] : null;
    const textContent = note.content.replace(/^\[Uploaded: .+?\](\[FileID: .+?\])?\n\n/, "");
    const ext = filename.split(".").pop()?.toLowerCase() || "file";
    const role = roleMap[note.roleId];

    docs.push({
      id: note.id,
      source: "note",
      filename,
      roleName: role?.name || "Unknown",
      roleId: note.roleId,
      roleColor: role?.color || "#666",
      fileType: ext,
      contentLength: textContent.length,
      preview: textContent.slice(0, 500),
      summary: note.summary,
      pinned: note.pinned,
      createdAt: note.createdAt.toISOString(),
      fileUploadId,
    });
  }

  for (const file of fileUploads) {
    // Skip if we already have a note for this file (avoid duplicates)
    const alreadyHasNote = docs.some((d) => d.filename === file.filename && d.roleId === file.roleId);
    if (alreadyHasNote) continue;

    const ext = file.filename.split(".").pop()?.toLowerCase() || "file";
    const role = roleMap[file.roleId];
    const textContent = file.extractedText || "";

    docs.push({
      id: file.id,
      source: "file",
      filename: file.filename,
      roleName: role?.name || "Unknown",
      roleId: file.roleId,
      roleColor: role?.color || "#666",
      fileType: ext,
      contentLength: textContent.length,
      preview: textContent.slice(0, 500),
      summary: null,
      pinned: false,
      createdAt: file.createdAt.toISOString(),
      fileUploadId: file.id,
    });
  }

  // Sort by date descending
  docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(docs);
}
