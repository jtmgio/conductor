import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processFile, getStoragePath, MAX_FILE_SIZE, getUploadDir } from "@/lib/file-processor";
import fs from "fs/promises";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(req: NextRequest, _ctx: { params: { roleId: string } }) {
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

  return NextResponse.json({
    filename: file.name,
    mimeType: file.type,
    text,
    base64,
  });
}
