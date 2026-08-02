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

// --- Local MLX server (Conductor's own — see docs/RUNBOOK_LOCAL_AI.md) ---
//
// Conductor runs its own mlx_lm.server (com.conductor.mlx, port 11436). Port 11435
// is the kosmos PRODUCTION server — never point these defaults back at it. An mlx
// server will try to LOAD a model it doesn't have if a request names one (multi-GB
// RAM spike), so callLocal hard-rejects any model other than LOCAL_AI_MODEL.

export function getLocalModelId(): string {
  return process.env.LOCAL_AI_MODEL || "mlx-community/Qwen3-30B-A3B-Instruct-2507-4bit";
}

function getLocalBaseUrl(): string {
  // host.docker.internal: the app runs in Docker, the MLX server on the macOS host
  return process.env.LOCAL_AI_BASE_URL || "http://host.docker.internal:11436/v1";
}

// Default model for text-only background/structured jobs: local-first (free, private,
// no failed-cloud detour). Set DEFAULT_AI_MODEL to a cloud id to flip back globally.
// Vision paths must NOT use this — they pin a cloud model explicitly.
export function getDefaultTextModel(): string {
  return process.env.DEFAULT_AI_MODEL || `local/${getLocalModelId()}`;
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
  // Local MLX (Conductor's dedicated server)
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
  temperature?: number;
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
  temperature?: number;
}): Promise<AIResponse> {
  try {
    return await createCompletion(params);
  } catch (err) {
    if (getProvider(params.model) === "local") throw err;
    // Vision requests never fall back — the local model is text-only and silently
    // ignoring the image would produce confidently wrong output
    const hasImages = params.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image"),
    );
    if (hasImages) {
      console.error(
        `AI provider ${params.model} failed and request contains images — not falling back to text-only local model:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
    console.error(
      `AI provider ${params.model} failed, falling back to local MLX (${getLocalModelId()}):`,
      err instanceof Error ? err.message : err,
    );
    return createCompletion({ ...params, model: `local/${getLocalModelId()}` });
  }
}

// Cloud cost guard: uploads/history may carry local-scale documents (100K+ tokens,
// fine and free on the local server). Cloud providers get each text segment capped
// so selecting Sonnet with a huge document in-thread can't produce a surprise bill.
const CLOUD_MAX_TEXT_CHARS = Number(process.env.CLOUD_AI_MAX_TEXT_CHARS) || 60_000;

function capForCloud(text: string): string {
  if (text.length <= CLOUD_MAX_TEXT_CHARS) return text;
  return text.slice(0, CLOUD_MAX_TEXT_CHARS) + "\n\n[…content truncated for cloud model — full text available to the local model]";
}

// --- Anthropic implementation ---

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

  const response = await anthropic.messages.create({
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
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

// --- Local MLX implementation (OpenAI-compatible mlx_lm.server) ---

async function callLocal(params: {
  model: string;
  system?: string;
  messages: AIMessage[];
  max_tokens: number;
  temperature?: number;
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

  // Input guard: load-tested 2026-07-06 — beyond ~55K tokens of context, prompt
  // processing trips the macOS Metal GPU watchdog ("Impacting Interactivity") and
  // CRASHES the server. Cap total input well under that; trim the largest text
  // blocks (documents) first, never the newest message.
  const maxInputChars = Number(process.env.LOCAL_AI_MAX_INPUT_CHARS) || 160_000; // ≈40K tok
  const textOf = (m: AIMessage) =>
    typeof m.content === "string" ? m.content : m.content.map((b) => b.text || "").join("");
  let totalChars = params.messages.reduce((n, m) => n + textOf(m).length, 0) + (params.system?.length || 0);
  if (totalChars > maxInputChars) {
    const marker = "\n[…document trimmed to fit the local model's safe context window]";
    // Trim largest messages first (documents live in big blocks), excluding the final message
    const trimmable = params.messages.slice(0, -1).sort((a, b) => textOf(b).length - textOf(a).length);
    for (const m of trimmable) {
      if (totalChars <= maxInputChars) break;
      const text = textOf(m);
      const excess = totalChars - maxInputChars;
      const keep = Math.max(2_000, text.length - excess);
      if (keep >= text.length) continue;
      m.content = text.slice(0, keep) + marker;
      totalChars -= text.length - (keep + marker.length);
    }
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
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
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
