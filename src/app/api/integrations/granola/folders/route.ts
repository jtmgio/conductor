import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGranolaApiKey } from "@/lib/api-keys";

const GRANOLA_API = "https://public-api.granola.ai/v1";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = await getGranolaApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Granola API key not configured" }, { status: 500 });
  }

  // Fetch recent notes and extract unique folder names
  const folders = new Map<string, string>(); // name → id
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 5) {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${GRANOLA_API}/notes?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Granola API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    for (const note of data.notes || []) {
      const folderName = note.folder_membership?.[0]?.name || note.folder?.name;
      const folderId = note.folder_membership?.[0]?.id || note.folder?.id || "";
      if (folderName && !folders.has(folderName)) {
        folders.set(folderName, folderId);
      }
    }

    if (!data.hasMore) break;
    cursor = data.cursor || null;
    pages++;
  }

  return NextResponse.json({
    folders: Array.from(folders.entries()).map(([name, id]) => ({ name, id })),
  });
}
