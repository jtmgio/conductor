import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCommsCoverPayload } from "@/lib/comms-cover";

// GET — current comms-cover state: when the next sweep is, and whether one is due.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await getCommsCoverPayload());
}
