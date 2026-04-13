import { prisma } from "./prisma";

const RATES: Record<string, { inputPerM: number; outputPerM: number }> = {
  // Anthropic
  "claude-sonnet-4-6": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-haiku-4-5-20251001": { inputPerM: 0.25, outputPerM: 1.25 },
  "claude-opus-4-6": { inputPerM: 15.0, outputPerM: 75.0 },
  // OpenAI
  "gpt-5.4": { inputPerM: 2.5, outputPerM: 15.0 },
  "gpt-5.4-mini": { inputPerM: 0.75, outputPerM: 4.5 },
  "gpt-5.4-pro": { inputPerM: 30.0, outputPerM: 180.0 },
};

const DEFAULT_RATE = { inputPerM: 3.0, outputPerM: 15.0 };

function calculateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[model] || DEFAULT_RATE;
  const inputCost = (inputTokens / 1_000_000) * rate.inputPerM;
  const outputCost = (outputTokens / 1_000_000) * rate.outputPerM;
  return Math.round((inputCost + outputCost) * 100);
}

export async function trackUsage(
  endpoint: string,
  model: string,
  usage: { input_tokens: number; output_tokens: number },
  roleId?: string,
): Promise<void> {
  try {
    await prisma.aiUsage.create({
      data: {
        roleId: roleId || null,
        endpoint,
        model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        costCents: calculateCostCents(model, usage.input_tokens, usage.output_tokens),
      },
    });
  } catch {
    // Usage tracking should never break the main flow
  }
}
