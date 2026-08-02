import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatMessage, MESSAGE_FORMATS, type MessageFormat } from "@/lib/format-message";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roleId, rawMessage, format = "slack" } = await req.json();
  if (!rawMessage?.trim()) return NextResponse.json({ error: "rawMessage required" }, { status: 400 });
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });

  const validFormat: MessageFormat = (MESSAGE_FORMATS as readonly string[]).includes(format)
    ? (format as MessageFormat)
    : "slack";

  try {
    const formatted = await formatMessage({ roleId, rawMessage, format: validFormat });
    return NextResponse.json({ formatted, format: validFormat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
