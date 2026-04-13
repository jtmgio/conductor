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

// --- Allowed models for user-selectable endpoints ---

export const ALLOWED_MODELS = [
  // Anthropic
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-6",
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
}): Promise<AIResponse> {
  const provider = getProvider(params.model);

  if (provider === "openai") {
    return callOpenAI(params);
  }
  return callAnthropic(params);
}

// --- Anthropic implementation ---

async function callAnthropic(params: {
  model: string;
  system?: string;
  messages: AIMessage[];
  max_tokens: number;
}): Promise<AIResponse> {
  const apiKey = await getAnthropicApiKey();
  const anthropic = new Anthropic({ apiKey });

  // Convert messages to Anthropic format
  const messages: Anthropic.MessageParam[] = params.messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
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
      return { type: "text" as const, text: block.text || "" };
    });
    return { role: m.role, content: blocks };
  });

  const response = await anthropic.messages.create({
    model: params.model,
    max_tokens: params.max_tokens,
    ...(params.system ? { system: params.system } : {}),
    messages,
  });

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
        messages.push({ role: "user", content: m.content });
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
          return { type: "text" as const, text: block.text || "" };
        });
        messages.push({ role: "user", content: parts });
      }
    } else {
      // Assistant messages are always text
      const text = typeof m.content === "string"
        ? m.content
        : m.content.map((b) => b.text || "").join("");
      messages.push({ role: "assistant", content: text });
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
