const JUDGE0_URL  = process.env.JUDGE0_URL   ?? "";
const AUTH_TOKEN  = process.env.JUDGE0_AUTH_TOKEN ?? "";

export interface Judge0Submission {
  language_id: number;
  source_code?: string;       // base64 — single-file
  additional_files?: string;  // base64 ZIP — multi-file (language_id=89)
  stdin?: string;
  expected_output?: string;
  callback_url?: string;
  cpu_time_limit?: number;
  memory_limit?: number;
}

export interface Judge0Token {
  token: string;
}

export interface Judge0Result {
  token: string;
  status: { id: number; description: string };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
  memory: number | null;
  exit_code: number | null;
}

// Terminal status IDs — execution will not change after reaching these
export const TERMINAL_STATUSES = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

export class TimeoutError extends Error {
  constructor(tokens: string[]) {
    super(`Judge0 execution timed out for tokens: ${tokens.join(", ")}`);
    this.name = "TimeoutError";
  }
}

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Auth-Token": AUTH_TOKEN,
  };
}

function b64decode(s: string | null): string | null {
  if (!s) return s;
  return Buffer.from(s, "base64").toString("utf8");
}

function decodeResult(r: Judge0Result): Judge0Result {
  return {
    ...r,
    stdout:         b64decode(r.stdout),
    stderr:         b64decode(r.stderr),
    compile_output: b64decode(r.compile_output),
  };
}

/**
 * Submit one or more submissions to Judge0.
 * POST /submissions/batch?base64_encoded=true
 */
export async function submitBatch(
  submissions: Judge0Submission[],
): Promise<Judge0Token[]> {
  const res = await fetch(
    `${JUDGE0_URL}/submissions/batch?base64_encoded=true`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ submissions }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Judge0 submitBatch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<Judge0Token[]>;
}

const RESULT_FIELDS =
  "token,status,stdout,stderr,compile_output,time,memory,exit_code";

/**
 * Fetch current results for a list of tokens.
 * GET /submissions/batch?tokens=...&base64_encoded=true&fields=...
 * Decodes base64 stdout/stderr/compile_output before returning.
 */
export async function getResults(tokens: string[]): Promise<Judge0Result[]> {
  const params = new URLSearchParams({
    tokens: tokens.join(","),
    base64_encoded: "true",
    fields: RESULT_FIELDS,
  });
  const res = await fetch(`${JUDGE0_URL}/submissions/batch?${params}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Judge0 getResults failed (${res.status}): ${text}`);
  }
  const { submissions } = (await res.json()) as { submissions: Judge0Result[] };
  return submissions.map(decodeResult);
}

/**
 * Poll getResults every pollMs until all tokens reach a terminal status
 * or maxWaitMs is exceeded. Throws TimeoutError on timeout.
 * Used when a callback_url is not available (dev / unit tests).
 */
export async function waitForCompletion(
  tokens: string[],
  pollMs = 1000,
  maxWaitMs = 30_000,
): Promise<Judge0Result[]> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const results = await getResults(tokens);
    if (results.every((r) => TERMINAL_STATUSES.has(r.status.id))) {
      return results;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new TimeoutError(tokens);
}
