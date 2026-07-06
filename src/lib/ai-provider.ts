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

// --- Local MLX server (shared with the kosmos stack — see docs/RUNBOOK_LOCAL_AI.md) ---
//
// The server on port 11435 is owned by com.kosmos.mlx and serves PRODUCTION traffic.
// Conductor is a guest: HTTP client only, exact loaded model id only, never manage
// the server process. mlx_lm.server will try to LOAD a model it doesn't have if a
// request names one — on a shared box that's a multi-GB RAM spike, so callLocal
// hard-rejects any model other than LOCAL_AI_MODEL.

export function getLocalModelId(): string {
  return process.env.LOCAL_AI_MODEL || "mlx-community/Qwen2.5-32B-Instruct-4bit";
}

function getLocalBaseUrl(): string {
  // host.docker.internal: the app runs in Docker, the MLX server on the macOS host
  return process.env.LOCAL_AI_BASE_URL || "http://host.docker.internal:11435/v1";
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
  // Local MLX (shared kosmos server)
  `local/${getLocalModelId()}`,
];

// --- Provider detection ---

export function getProvider(model: string): "anthropic" | "openai" | "local" {
  if (model.startsWith("local/")) return "local";
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

  if (provider === "local") {
    return callLocal(params);
  }
  if (provider === "openai") {
    return callOpenAI(params);
  }
  return callAnthropic(params);
}

// Try the requested cloud model; on failure (billing, network, outage) retry once on
// the local MLX server. Used by background/structured jobs (e.g. calendar prep) that
// should degrade to local rather than silently produce nothing.
export async function createCompletionWithLocalFallback(params: {
  model: string;
  system?: string;
  messages: AIMessage[];
  max_tokens: number;
}): Promise<AIResponse> {
  try {
    return await createCompletion(params);
  } catch (err) {
    if (getProvider(params.model) === "local") throw err;
    console.error(
      `AI provider ${params.model} failed, falling back to local MLX (${getLocalModelId()}):`,
      err instanceof Error ? err.message : err,
    );
    return createCompletion({ ...params, model: `local/${getLocalModelId()}` });
  }
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

// --- Local MLX implementation (OpenAI-compatible mlx_lm.server) ---

async function callLocal(params: {
  model: string;
  system?: string;
  messages: AIMessage[];
  max_tokens: number;
}): Promise<AIResponse> {
  const requested = params.model.replace(/^local\//, "");
  const loaded = getLocalModelId();
  if (requested !== loaded) {
    // Naming an unloaded model would make the shared server try to fetch/load it —
    // never acceptable on the kosmos production box.
    throw new Error(
      `Local model "${requested}" is not the configured LOCAL_AI_MODEL ("${loaded}") — refusing to trigger a model load on the shared MLX server`,
    );
  }

  const client = new OpenAI({
    baseURL: getLocalBaseUrl(),
    apiKey: "mlx", // server requires none; SDK requires a value
    timeout: 120_000, // shared server may be busy with kosmos traffic — fail, don't wedge
    maxRetries: 1,
  });

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  // mlx_lm.server understands "system", not OpenAI's newer "developer" role
  if (params.system) {
    messages.push({ role: "system", content: params.system });
  }
  for (const m of params.messages) {
    // The local model is text-only — flatten content blocks, note dropped images
    const text = typeof m.content === "string"
      ? m.content
      : m.content
          .map((b) => (b.type === "image" ? "[image attachment omitted — local model is text-only]" : b.text || ""))
          .join("\n");
    messages.push({ role: m.role, content: text });
  }

  // Cap local generations: keeps chat replies inside the 120s client timeout and
  // bounds how long any one request occupies the shared Metal GPU
  const maxTokens = Math.min(
    params.max_tokens,
    Number(process.env.LOCAL_AI_MAX_TOKENS) || 2048,
  );

  const response = await client.chat.completions.create({
    model: requested,
    max_tokens: maxTokens,
    messages,
  });

  const text = response.choices[0]?.message?.content || "";

  return {
    text,
    model: `local/${response.model}`,
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
    },
  };
}
