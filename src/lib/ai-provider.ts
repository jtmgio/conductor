import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getAnthropicApiKey, getOpenAIApiKey } from "./api-keys";

// --- Types ---

export interface AIContentBlock {
  type: "text" | "image";
  text?: string;
  // Anthropic-style image source
  source?: { type: "base64"; media_type: string; data: string };
}

export interface AIMessage {
  role: "user" | "assistant";
  content: string | AIContentBlock[];
}

export interface AIResponse {
  text: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

// Default model for every text job. DEFAULT_AI_MODEL overrides it globally.
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

export function getDefaultTextModel(): string {
  return process.env.DEFAULT_AI_MODEL || DEFAULT_CLAUDE_MODEL;
}

// --- Allowed models for user-selectable endpoints ---

export const ALLOWED_MODELS = [
  // Anthropic
  DEFAULT_CLAUDE_MODEL,
  // OpenAI
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-pro",
];

// --- Provider detection ---

export function getProvider(model: string): "anthropic" | "openai" {
  if (model.startsWith("gpt-")) return "openai";
  return "anthropic";
}

// --- Unified completion ---

export async function createCompletion(params: {
  model: string;
  system?: string;
  messages: AIMessage[];
  max_tokens: number;
  temperature?: number;
}): Promise<AIResponse> {
  const provider = getProvider(params.model);

  if (provider === "openai") {
    return callOpenAI(params);
  }
  return callAnthropic(params);
}

// Cost guard: uploads and history can carry very large documents. Each text
// segment is capped so a huge document in-thread can't produce a surprise bill.
const CLOUD_MAX_TEXT_CHARS = Number(process.env.CLOUD_AI_MAX_TEXT_CHARS) || 60_000;

function capForCloud(text: string): string {
  if (text.length <= CLOUD_MAX_TEXT_CHARS) return text;
  return text.slice(0, CLOUD_MAX_TEXT_CHARS) + "\n\n[…content truncated to keep the request size bounded]";
}

// --- Anthropic implementation ---

const ANTHROPIC_MIN_MAX_TOKENS = 16_000;

async function callAnthropic(params: {
  model: string;
  system?: string;
  messages: AIMessage[];
  max_tokens: number;
  temperature?: number;
}): Promise<AIResponse> {
  const apiKey = await getAnthropicApiKey();
  const anthropic = new Anthropic({ apiKey });

  // Convert messages to Anthropic format
  const messages: Anthropic.MessageParam[] = params.messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: capForCloud(m.content) };
    }
    // Convert content blocks
    const blocks: Anthropic.ContentBlockParam[] = m.content.map((block) => {
      if (block.type === "image" && block.source) {
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: block.source.media_type as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
            data: block.source.data,
          },
        };
      }
      return { type: "text" as const, text: capForCloud(block.text || "") };
    });
    return { role: m.role, content: blocks };
  });

  // Claude Opus 5.5 always thinks, and thinking counts toward max_tokens. Callers
  // size max_tokens for the reply alone, so give every request room for both.
  // temperature is not sent: Opus 5.5 rejects sampling parameters with a 400.
  const response = await anthropic.messages.create({
    model: params.model,
    max_tokens: Math.max(params.max_tokens, ANTHROPIC_MIN_MAX_TOKENS),
    output_config: { effort: "low" },
    ...(params.system ? { system: params.system } : {}),
    messages,
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined the request (stop_reason: refusal)`);
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    text,
    model: response.model,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

// --- OpenAI implementation ---

async function callOpenAI(params: {
  model: string;
  system?: string;
  messages: AIMessage[];
  max_tokens: number;
  temperature?: number;
}): Promise<AIResponse> {
  const apiKey = await getOpenAIApiKey();
  if (!apiKey) throw new Error("OpenAI API key not configured");
  const openai = new OpenAI({ apiKey });

  // Build OpenAI messages
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  // System prompt as developer message
  if (params.system) {
    messages.push({ role: "developer", content: params.system });
  }

  // Convert user/assistant messages
  for (const m of params.messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") {
        messages.push({ role: "user", content: capForCloud(m.content) });
      } else {
        const parts: OpenAI.ChatCompletionContentPart[] = m.content.map((block) => {
          if (block.type === "image" && block.source) {
            return {
              type: "image_url" as const,
              image_url: {
                url: `data:${block.source.media_type};base64,${block.source.data}`,
              },
            };
          }
          return { type: "text" as const, text: capForCloud(block.text || "") };
        });
        messages.push({ role: "user", content: parts });
      }
    } else {
      // Assistant messages are always text
      const text = typeof m.content === "string"
        ? m.content
        : m.content.map((b) => b.text || "").join("");
      messages.push({ role: "assistant", content: capForCloud(text) });
    }
  }

  const response = await openai.chat.completions.create({
    model: params.model,
    max_tokens: params.max_tokens,
    messages,
  });

  const text = response.choices[0]?.message?.content || "";

  return {
    text,
    model: response.model,
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
    },
  };
}
