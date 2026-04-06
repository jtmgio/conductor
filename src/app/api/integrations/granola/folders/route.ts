import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const GRANOLA_API = "https://public-api.granola.ai/v1";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GRANOLA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GRANOLA_API_KEY not configured" }, { status: 500 });
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
      if (note.folder?.name && !folders.has(note.folder.name)) {
        folders.set(note.folder.name, note.folder.id || "");
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
