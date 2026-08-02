import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { refineTask } from "@/lib/task-refine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rawText, roleId } = await req.json();
  if (!rawText?.trim()) return NextResponse.json({ error: "rawText required" }, { status: 400 });

  try {
    const refined = await refineTask({ rawText, roleId });
    return NextResponse.json({ refined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
