import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integrations = await prisma.integration.findMany({
    orderBy: { createdAt: "asc" },
  });

  // Mask API keys in response
  const masked = integrations.map((i) => {
    const config = i.config as Record<string, string>;
    return {
      ...i,
      config: {
        ...config,
        apiKey: config.apiKey ? `${config.apiKey.slice(0, 12)}${"•".repeat(20)}` : "",
      },
    };
  });

  return NextResponse.json(masked);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, roleId, config } = await req.json();
  if (!type || !roleId || !config) {
    return NextResponse.json({ error: "type, roleId, and config required" }, { status: 400 });
  }

  const integration = await prisma.integration.create({
    data: { type, roleId, config, enabled: true },
  });

  return NextResponse.json(integration);
}
