const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE = 128;
const MAX_RETRIES = 3;

export type VoyageInputType = "document" | "query";
export type VoyageDimension = 256 | 512 | 1024 | 2048;

export interface VoyageEmbedOptions {
  model?: "voyage-code-3";
  inputType?: VoyageInputType;
  outputDimension?: VoyageDimension;
}

async function fetchBatch(
  texts: string[],
  opts: Required<VoyageEmbedOptions>,
  signal?: AbortSignal,
): Promise<number[][]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));

    const res = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: opts.model,
        input: texts,
        input_type: opts.inputType,
        output_dimension: opts.outputDimension,
      }),
      signal,
    });

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "1", 10);
      lastError = new Error(`Voyage API error ${res.status}`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Voyage API error ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }
  throw lastError ?? new Error("Voyage API failed after retries");
}

export async function embed(
  texts: string[],
  opts: VoyageEmbedOptions = {},
  signal?: AbortSignal,
): Promise<number[][]> {
  const resolved: Required<VoyageEmbedOptions> = {
    model: opts.model ?? "voyage-code-3",
    inputType: opts.inputType ?? "document",
    outputDimension: opts.outputDimension ?? 1024,
  };

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const vecs = await fetchBatch(batch, resolved, signal);
    results.push(...vecs);
    if (i + BATCH_SIZE < texts.length) await new Promise((r) => setTimeout(r, 100));
  }
  return results;
}
