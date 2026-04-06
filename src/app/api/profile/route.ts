import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let profile = await prisma.userProfile.findUnique({ where: { id: "default" } });
  if (!profile) {
    profile = await prisma.userProfile.create({ data: { id: "default" } });
  }
  // Mask API key in response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { anthropicApiKey, passwordHash, ...safe } = profile;
  const hasKey = !!(anthropicApiKey || process.env.ANTHROPIC_API_KEY);
  return NextResponse.json({
    ...safe,
    hasAnthropicKey: hasKey,
    anthropicApiKeySource: anthropicApiKey ? "database" : process.env.ANTHROPIC_API_KEY ? "environment" : null,
    anthropicApiKeyMasked: anthropicApiKey ? `${anthropicApiKey.slice(0, 10)}...${anthropicApiKey.slice(-4)}` : null,
  });
}

export async function PUT(req: NextRequest) {
  // Allow unauthenticated access during setup (no roles = fresh install)
  const roleCount = await prisma.role.count();
  if (roleCount > 0) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { communicationStyle, sampleMessages, globalContext, calendarIgnorePatterns, anthropicApiKey } = await req.json();

  // Only allow API key writes when authenticated (not during setup bypass)
  const isAuthenticated = roleCount > 0;
  const safeApiKey = isAuthenticated && anthropicApiKey !== undefined ? { anthropicApiKey } : {};

  const profile = await prisma.userProfile.upsert({
    where: { id: "default" },
    update: {
      ...(communicationStyle !== undefined && { communicationStyle }),
      ...(sampleMessages !== undefined && { sampleMessages }),
      ...(globalContext !== undefined && { globalContext }),
      ...(calendarIgnorePatterns !== undefined && { calendarIgnorePatterns }),
      ...safeApiKey,
    },
    create: {
      id: "default",
      communicationStyle,
      sampleMessages,
      globalContext,
      calendarIgnorePatterns,
      ...(isAuthenticated ? { anthropicApiKey } : {}),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { anthropicApiKey: _key, passwordHash: _pw, ...safeProfile } = profile;
  return NextResponse.json(safeProfile);
}
