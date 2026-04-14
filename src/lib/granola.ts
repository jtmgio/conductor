import { getGranolaApiKey } from "@/lib/api-keys";

const GRANOLA_API = "https://public-api.granola.ai/v1";

export interface GranolaNote {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  owner: { name: string; email: string };
  folder?: { id: string; name: string } | null;
  folder_membership?: Array<{ id: string; name: string }>;
}

export interface GranolaNoteWithTranscript extends GranolaNote {
  transcript: Array<{ speaker: { source: string; name?: string }; text: string }>;
}

export async function getApiKey(): Promise<string> {
  const key = await getGranolaApiKey();
  if (!key) throw new Error("Granola API key not configured");
  return key;
}

export async function fetchRecentNotes(apiKey: string, since: Date): Promise<GranolaNote[]> {
  const allNotes: GranolaNote[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ created_after: since.toISOString() });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${GRANOLA_API}/notes?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Granola API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    allNotes.push(...(data.notes || []));
    hasMore = data.hasMore || false;
    cursor = data.cursor || null;

    if (allNotes.length > 200) break;
  }

  return allNotes;
}

export async function fetchNoteWithTranscript(apiKey: string, noteId: string): Promise<GranolaNoteWithTranscript> {
  const res = await fetch(`${GRANOLA_API}/notes/${noteId}?include=transcript`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Granola API error fetching note ${noteId}: ${res.status}`);
  }

  return res.json();
}

export function resolveRole(
  folderName: string | null | undefined,
  folderMap: Record<string, string>,
  roleNameMap: Record<string, string>,
  fallbackRoleId: string | null,
): string | null {
  if (folderName) {
    if (folderMap[folderName]) return folderMap[folderName];

    const lower = folderName.toLowerCase();
    for (const [name, roleId] of Object.entries(folderMap)) {
      if (name.toLowerCase() === lower) return roleId;
    }

    if (roleNameMap[folderName]) return roleNameMap[folderName];
    for (const [name, roleId] of Object.entries(roleNameMap)) {
      if (name.toLowerCase() === lower) return roleId;
    }
  }

  return fallbackRoleId;
}

export function buildTranscriptContent(fullNote: GranolaNoteWithTranscript): string {
  const transcriptText =
    fullNote.transcript
      ?.map((t) => {
        const speaker = t.speaker?.name || t.speaker?.source || "Unknown";
        return `${speaker}: ${t.text}`;
      })
      .join("\n") || "";

  return fullNote.summary
    ? `AI Summary:\n${fullNote.summary}\n\nFull Transcript:\n${transcriptText.slice(0, 6000)}`
    : transcriptText.slice(0, 8000);
}
