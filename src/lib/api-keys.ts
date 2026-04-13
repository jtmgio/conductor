import { prisma } from "./prisma";

export async function getAnthropicApiKey(): Promise<string | undefined> {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { id: "default" },
      select: { anthropicApiKey: true },
    });
    if (profile?.anthropicApiKey) return profile.anthropicApiKey;
  } catch {
    // DB not ready — fall back to env
  }
  return process.env.ANTHROPIC_API_KEY;
}

export async function getOpenAIApiKey(): Promise<string | undefined> {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { id: "default" },
      select: { openaiApiKey: true },
    });
    if (profile?.openaiApiKey) return profile.openaiApiKey;
  } catch {
    // DB not ready — fall back to env
  }
  return process.env.OPENAI_API_KEY;
}
