import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Models, MODEL_FALLBACK, type ModelKey } from "./models";
import { generateCanary, verifyResponse, type SystemBlock } from "./canary";
import {
  APIError,
  CanaryEchoedError,
  ModelOverloadedError,
  RateLimitError,
  RefusalViolationError,
  SchemaParseError,
} from "./errors";

// ---------------------------------------------------------------------------
// Output filter — banned patterns per plan P.4 L3
// ---------------------------------------------------------------------------
const BANNED_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /rm\s+-rf\s+[/~]/i,            label: "destructive-rm" },
  { re: /curl\s+.+\|\s*(ba)?sh/i,      label: "curl-pipe-shell" },
  { re: /wget\s+.+\|\s*(ba)?sh/i,      label: "wget-pipe-shell" },
  { re: /reverse.{0,20}shell/i,         label: "reverse-shell" },
  { re: /base64\s+-d\s+.+\|\s*(ba)?sh/i, label: "base64-pipe-shell" },
  { re: /cryptominer|xmrig|stratum\+tcp/i, label: "cryptominer" },
];

export function checkOutputFilter(text: string): void {
  for (const { re, label } of BANNED_PATTERNS) {
    if (re.test(text)) throw new RefusalViolationError(label);
  }
}

// ---------------------------------------------------------------------------
// User content wrapping (plan P.4 L1)
// ---------------------------------------------------------------------------
type MessageParam = Anthropic.MessageParam;

export function wrapUserContent(messages: MessageParam[]): MessageParam[] {
  return messages.map((msg) => {
    if (msg.role !== "user") return msg;
    if (typeof msg.content === "string") {
      return { ...msg, content: `<user_input>${msg.content}</user_input>` };
    }
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((block) => {
          if (block.type === "text") {
            return { ...block, text: `<user_input>${block.text}</user_input>` };
          }
          return block;
        }),
      };
    }
    return msg;
  });
}

// ---------------------------------------------------------------------------
// JSON schema helper (zod → JSON Schema)
// ---------------------------------------------------------------------------
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { zodToJsonSchema: convert } = require("zod-to-json-schema");
    return convert(schema, { target: "openApi3" }) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof CanaryEchoedError || err instanceof RefusalViolationError) {
        throw err; // never retry security violations
      }
      const isRetryable =
        err instanceof APIError &&
        (err.status === 429 || (err.status >= 500 && err.status !== 529));
      if (!isRetryable || attempt === maxRetries) break;

      const retryAfter =
        err instanceof RateLimitError ? err.retryAfterSeconds * 1000 : 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, retryAfter));
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// JSON extraction helper — handles markdown code fences from proxy responses
// ---------------------------------------------------------------------------
function extractJSON(text: string): string {
  // Check for a JSON object first — handles direct JSON and JSON inside fences.
  // Doing this before fence extraction avoids false matches on embedded markdown
  // code fences inside JSON string values (e.g. starterRepo file content with ```bash).
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  // Fall back: response might be a lone fence with JSON inside
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  return text;
}

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------
// Proxy mode: custom base URL (e.g. vibetoken) that doesn't support Anthropic betas
const proxyMode = !!process.env.ANTHROPIC_BASE_URL;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// call<T> — structured-output (or unstructured) call
// ---------------------------------------------------------------------------
export type CallOptions<T> = {
  model: ModelKey;
  system: SystemBlock[];
  messages: MessageParam[];
  tools?: Anthropic.Tool[];
  tool_choice?: Anthropic.ToolChoiceAny | Anthropic.ToolChoiceAuto | Anthropic.ToolChoiceTool;
  output_schema?: z.ZodTypeAny;
  max_tokens?: number;
  temperature?: number;
};

export type CallResult<T> = {
  parsed: T;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  raw: Anthropic.Message;
};

async function callOnce<T = string>(opts: CallOptions<T>): Promise<CallResult<T>> {
  const canary = generateCanary();
  const system = opts.system; // canary already injected by assembleSystemPrompt

  let wrappedMessages = wrapUserContent(opts.messages);

  // In proxy mode without response_format, instruct the model to return raw JSON
  // Include the JSON schema so the model knows the exact field names and types required.
  if (proxyMode && opts.output_schema) {
    const schema = zodToJsonSchema(opts.output_schema);
    const jsonInstruction: Anthropic.MessageParam = {
      role: "user",
      content: `Output ONLY a raw JSON object — no markdown code fences, no prose, no explanation — that strictly conforms to this JSON Schema:\n${JSON.stringify(schema, null, 2)}`,
    };
    wrappedMessages = [...wrappedMessages, jsonInstruction];
  }

  const extraHeaders: Record<string, string> = proxyMode
    ? {}
    : { "anthropic-beta": "output-300k-2026-03-24" };

  const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: Models[opts.model],
    max_tokens: opts.max_tokens ?? 8192,
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    system: system as Anthropic.TextBlockParam[],
    messages: wrappedMessages,
    ...(opts.tools ? { tools: opts.tools } : {}),
    ...(opts.tool_choice ? { tool_choice: opts.tool_choice } : {}),
    ...(opts.output_schema && !proxyMode
      ? {
          betas: ["output-128k-2025-02-19"],
          response_format: {
            type: "json_schema" as const,
            json_schema: {
              name: "structured_output",
              schema: zodToJsonSchema(opts.output_schema),
              strict: true,
            },
          },
        }
      : {}),
  };

  const raw = await withRetry(async () => {
    try {
      return await getClient().messages.create(
        requestParams as Anthropic.MessageCreateParamsNonStreaming,
        { headers: extraHeaders },
      );
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        "message" in err
      ) {
        const e = err as { status: number; message: string; headers?: Headers };
        if (e.status === 429) {
          const retryAfter = parseInt(
            (e.headers as unknown as Record<string, string>)?.["retry-after"] ?? "60",
            10,
          );
          throw new RateLimitError(retryAfter);
        }
        if (e.status === 529) {
          throw new ModelOverloadedError(Models[opts.model]);
        }
        throw new APIError(e.status, String(e.message));
      }
      throw err;
    }
  });

  const textBlock = raw.content.find((b) => b.type === "text") as
    | Anthropic.TextBlock
    | undefined;
  const responseText = textBlock?.text ?? "";

  verifyResponse(responseText, canary);
  checkOutputFilter(responseText);

  let parsed: T;
  if (opts.output_schema) {
    try {
      const jsonObj = JSON.parse(extractJSON(responseText));
      parsed = opts.output_schema.parse(jsonObj) as T;
    } catch (err) {
      console.error("[anthropic] Schema validation failed. Raw response:", responseText);
      throw new SchemaParseError(err, responseText);
    }
  } else {
    parsed = responseText as unknown as T;
  }

  return {
    parsed,
    usage: {
      input_tokens: raw.usage.input_tokens,
      output_tokens: raw.usage.output_tokens,
      cache_creation_input_tokens:
        (raw.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
      cache_read_input_tokens:
        (raw.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
    },
    raw,
  };
}

// Public entry point — retries with fallback model on 529 overloaded errors
export async function call<T = string>(opts: CallOptions<T>): Promise<CallResult<T>> {
  let currentModel: ModelKey = opts.model;
  while (true) {
    try {
      return await callOnce<T>({ ...opts, model: currentModel });
    } catch (err) {
      if (err instanceof ModelOverloadedError) {
        const fallback = MODEL_FALLBACK[currentModel];
        if (fallback) {
          currentModel = fallback;
          continue;
        }
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// callStream — yields text deltas
// ---------------------------------------------------------------------------
export type StreamOptions = Omit<CallOptions<string>, "output_schema">;

export async function* callStream(opts: StreamOptions): AsyncGenerator<string> {
  const canary = generateCanary();
  const wrappedMessages = wrapUserContent(opts.messages);

  const stream = getClient().messages.stream({
    model: Models[opts.model],
    max_tokens: opts.max_tokens ?? 8192,
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    system: opts.system as Anthropic.TextBlockParam[],
    messages: wrappedMessages,
    ...(opts.tools ? { tools: opts.tools } : {}),
    ...(opts.tool_choice ? { tool_choice: opts.tool_choice } : {}),
  });

  let fullText = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const chunk = event.delta.text;
      fullText += chunk;
      yield chunk;
    }
  }

  verifyResponse(fullText, canary);
  checkOutputFilter(fullText);
}

// ---------------------------------------------------------------------------
// callWithCitations — Citations API (incompatible with response_format)
// ---------------------------------------------------------------------------
export type CitationsResult = {
  markdown: string;
  plainText: string;
  citations: Array<{ id: string; source: string; excerpt: string }>;
};

export async function callWithCitations(opts: {
  model: ModelKey;
  system: SystemBlock[];
  messages: MessageParam[];
  max_tokens?: number;
}): Promise<CitationsResult> {
  const canary = generateCanary();
  const wrappedMessages = wrapUserContent(opts.messages);

  const raw = await withRetry(() =>
    getClient().messages.create({
      model: Models[opts.model],
      max_tokens: opts.max_tokens ?? 8192,
      system: opts.system as Anthropic.TextBlockParam[],
      messages: wrappedMessages,
      ...(proxyMode ? {} : { betas: ["citations-2025-04-04"] }),
    } as Anthropic.MessageCreateParamsNonStreaming),
  );

  const textBlock = raw.content.find((b) => b.type === "text") as
    | Anthropic.TextBlock
    | undefined;
  const responseText = textBlock?.text ?? "";

  verifyResponse(responseText, canary);
  checkOutputFilter(responseText);

  // Extract inline citations from the response text
  const citations: CitationsResult["citations"] = [];
  let citIndex = 0;
  const markdown = responseText.replace(
    /\[([^\]]+)\]\(#cite-([^)]+)\)/g,
    (_match, text, sourceId) => {
      citations.push({ id: String(citIndex++), source: sourceId, excerpt: text });
      return `${text}[^${citIndex}]`;
    },
  );

  return { markdown, plainText: responseText, citations };
}
