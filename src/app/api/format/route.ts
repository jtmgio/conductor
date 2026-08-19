import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatMessage, toRichHtml, MESSAGE_FORMATS, type MessageFormat } from "@/lib/format-message";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = process.env.MCP_API_TOKEN;
  return !!expected && token === expected;
}

/**
 * Bearer-authed message formatting for native clients — the Todo capture app's message
 * mode, and anything else outside a browser session.
 *
 * /api/ai/format-message already does this but is gated on a NextAuth session, which a
 * Swift app has no way to hold. Same shared formatter underneath (src/lib/format-message,
 * including the voice guide); this route just takes the capture app's vocabulary: a
 * company by id OR name, and the platform.
 *
 *   POST /api/format
 *   Authorization: Bearer $MCP_API_TOKEN
 *   { "text": "...", "role": "vQuip", "platform": "slack" }
 *   -> { ok, formatted, company, platform }
 */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const requested = typeof body?.role === "string" ? body.role.trim() : "";
  const roles = await prisma.role.findMany({ select: { id: true, name: true }, orderBy: { priority: "asc" } });
  const n = requested.toLowerCase();
  const role =
    roles.find((r) => r.id === requested) ||
    roles.find((r) => r.name.toLowerCase() === n) ||
    roles.find((r) => r.name.toLowerCase().includes(n) || (n && n.includes(r.name.toLowerCase())));
  if (!role) return NextResponse.json({ error: "No company matched" }, { status: 400 });

  const asked = String(body?.platform || "slack").toLowerCase();
  const platform: MessageFormat = (MESSAGE_FORMATS as readonly string[]).includes(asked)
    ? (asked as MessageFormat)
    : "slack";

  try {
    const formatted = await formatMessage({ roleId: role.id, rawMessage: text, format: platform });
    // `html` is the rich-paste flavor. Slack renders it directly; without it a plain-text
    // paste shows literal backticks and makes you click "Apply formatting?".
    return NextResponse.json({
      ok: true,
      formatted,
      html: toRichHtml(formatted, platform),
      company: role.name,
      platform,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
