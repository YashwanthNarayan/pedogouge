export const Models = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;

export type ModelKey = keyof typeof Models;
export type ModelId = (typeof Models)[ModelKey];

// Fallback chain: opus → sonnet → haiku
export const MODEL_FALLBACK: Partial<Record<ModelKey, ModelKey>> = {
  opus: "sonnet",
  sonnet: "haiku",
};

// Per-million-token pricing (USD)
export const Pricing: Record<
  ModelKey,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  opus:   { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 },
  sonnet: { input:  3.00, output: 15.00, cacheWrite:  3.75, cacheRead: 0.30 },
  haiku:  { input:  0.80, output:  4.00, cacheWrite:  1.00, cacheRead: 0.08 },
};

export function estimateCostUsd(
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  },
  model: ModelKey,
): number {
  const p = Pricing[model];
  const M = 1_000_000;
  return (
    (usage.input_tokens / M) * p.input +
    (usage.output_tokens / M) * p.output +
    ((usage.cache_creation_input_tokens ?? 0) / M) * p.cacheWrite +
    ((usage.cache_read_input_tokens ?? 0) / M) * p.cacheRead
  );
}
