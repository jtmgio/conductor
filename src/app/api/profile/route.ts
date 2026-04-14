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
  // Mask API keys in response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { anthropicApiKey, openaiApiKey, granolaApiKey, passwordHash, ...safe } = profile;
  const hasAnthropicKey = !!(anthropicApiKey || process.env.ANTHROPIC_API_KEY);
  const hasOpenAIKey = !!(openaiApiKey || process.env.OPENAI_API_KEY);
  const hasGranolaKey = !!(granolaApiKey || process.env.GRANOLA_API_KEY);
  return NextResponse.json({
    ...safe,
    hasAnthropicKey: hasAnthropicKey,
    hasOpenAIKey: hasOpenAIKey,
    hasGranolaKey: hasGranolaKey,
    anthropicApiKeySource: anthropicApiKey ? "database" : process.env.ANTHROPIC_API_KEY ? "environment" : null,
    anthropicApiKeyMasked: anthropicApiKey ? `${anthropicApiKey.slice(0, 10)}...${anthropicApiKey.slice(-4)}` : null,
    openaiApiKeySource: openaiApiKey ? "database" : process.env.OPENAI_API_KEY ? "environment" : null,
    openaiApiKeyMasked: openaiApiKey ? `${openaiApiKey.slice(0, 10)}...${openaiApiKey.slice(-4)}` : null,
    granolaApiKeyMasked: granolaApiKey ? `${granolaApiKey.slice(0, 10)}...${granolaApiKey.slice(-4)}` : null,
  });
}

export async function PUT(req: NextRequest) {
  // Allow unauthenticated access during setup (no password = setup in progress)
  const existingProfile = await prisma.userProfile.findUnique({ where: { id: "default" }, select: { passwordHash: true } });
  const isSetupComplete = !!(existingProfile?.passwordHash || process.env.APP_PASSWORD_HASH);
  if (isSetupComplete) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { communicationStyle, sampleMessages, globalContext, calendarIgnorePatterns, calendarRoleMappings, anthropicApiKey, openaiApiKey, granolaApiKey, aiRecentNotesCount, aiRecentTranscriptsCount, aiConversationHistoryLimit, aiNoteChunkSize, aiTranscriptChunkSize, aiPinnedNoteChunkSize } = await req.json();

  // Only allow API key writes when authenticated (not during setup bypass)
  const safeApiKeys = isSetupComplete ? {
    ...(anthropicApiKey !== undefined ? { anthropicApiKey } : {}),
    ...(openaiApiKey !== undefined ? { openaiApiKey } : {}),
    ...(granolaApiKey !== undefined ? { granolaApiKey } : {}),
  } : {};

  const profile = await prisma.userProfile.upsert({
    where: { id: "default" },
    update: {
      ...(communicationStyle !== undefined && { communicationStyle }),
      ...(sampleMessages !== undefined && { sampleMessages }),
      ...(globalContext !== undefined && { globalContext }),
      ...(calendarIgnorePatterns !== undefined && { calendarIgnorePatterns }),
      ...(calendarRoleMappings !== undefined && { calendarRoleMappings }),
      ...(aiRecentNotesCount !== undefined && { aiRecentNotesCount }),
      ...(aiRecentTranscriptsCount !== undefined && { aiRecentTranscriptsCount }),
      ...(aiConversationHistoryLimit !== undefined && { aiConversationHistoryLimit }),
      ...(aiNoteChunkSize !== undefined && { aiNoteChunkSize }),
      ...(aiTranscriptChunkSize !== undefined && { aiTranscriptChunkSize }),
      ...(aiPinnedNoteChunkSize !== undefined && { aiPinnedNoteChunkSize }),
      ...safeApiKeys,
    },
    create: {
      id: "default",
      communicationStyle,
      sampleMessages,
      globalContext,
      calendarIgnorePatterns,
      calendarRoleMappings,
      aiRecentNotesCount,
      aiRecentTranscriptsCount,
      aiConversationHistoryLimit,
      aiNoteChunkSize,
      aiTranscriptChunkSize,
      aiPinnedNoteChunkSize,
      ...(isSetupComplete ? { anthropicApiKey, openaiApiKey } : {}),
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { anthropicApiKey: _key, openaiApiKey: _oKey, granolaApiKey: _gKey, passwordHash: _pw, ...safeProfile } = profile;
  return NextResponse.json(safeProfile);
}
