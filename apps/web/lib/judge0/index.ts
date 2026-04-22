import type { SupabaseClient } from "@supabase/supabase-js";
import { submitBatch } from "./client.js";
import { buildZip, type SourceFile } from "./zip.js";

// Judge0 language IDs stored for reference in execution_runs.lang_id
const LANG_IDS: Record<string, number> = {
  python: 71,
  javascript: 63,
  typescript: 74,
  java: 62,
  cpp: 54,
  c: 50,
};

// Language ID 89 = Multi-file program (ZIP) — Judge0 CE Extra
const MULTI_FILE_LANG_ID = 89;

export interface ExecuteOptions {
  sessionId: string;
  files: SourceFile[];
  entrypoint: string;
  lang: string;
  callbackUrl?: string;
  stdin?: string;
}

export interface ExecuteResult {
  runId: string;   // DB row UUID
  token: string;   // Judge0 submission token
}

/**
 * Build a ZIP, submit to Judge0, and insert an execution_run row.
 * Returns runId (DB) and token (Judge0) immediately — completion
 * arrives via callback webhook or can be polled with waitForCompletion().
 */
export async function executeFiles(
  opts: ExecuteOptions,
  supabase: SupabaseClient,
): Promise<ExecuteResult> {
  const { sessionId, files, entrypoint, lang, callbackUrl, stdin } = opts;

  const zipBase64 = await buildZip(files, entrypoint, lang);

  const tokens = await submitBatch([
    {
      language_id: MULTI_FILE_LANG_ID,
      additional_files: zipBase64,
      stdin: stdin ? Buffer.from(stdin).toString("base64") : undefined,
      callback_url: callbackUrl,
      cpu_time_limit: 10,
      memory_limit: 128_000,
    },
  ]);

  const tokenObj = tokens[0];
  if (!tokenObj) throw new Error("Judge0 returned no token");

  const { data, error } = await supabase
    .from("execution_runs")
    .insert({
      session_id: sessionId,
      judge0_token: tokenObj.token,
      lang_id: LANG_IDS[lang] ?? MULTI_FILE_LANG_ID,
      source: "judge0",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`execution_run insert failed: ${error?.message ?? "no data"}`);
  }

  return { runId: (data as { id: string }).id, token: tokenObj.token };
}

export { buildZip, type SourceFile } from "./zip.js";
export {
  submitBatch,
  getResults,
  waitForCompletion,
  TERMINAL_STATUSES,
  TimeoutError,
  type Judge0Submission,
  type Judge0Token,
  type Judge0Result,
} from "./client.js";
