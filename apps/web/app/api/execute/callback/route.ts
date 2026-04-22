import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ExecuteWebhookRequest } from "@pedagogue/shared";
import { Channels } from "@pedagogue/shared";

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CALLBACK_SECRET = process.env.JUDGE0_CALLBACK_SECRET ?? "";

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function b64decode(s: string | null): string | null {
  if (!s) return s;
  try {
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return s; // already plain text (Judge0 self-host may skip encoding)
  }
}

/**
 * POST /api/execute/callback?secret=...
 * Judge0 calls this when a submission reaches a terminal status.
 * Validates the shared secret, updates the execution_run row, and
 * broadcasts the result on the execution channel so the extension
 * can display it without polling.
 */
export async function POST(req: NextRequest) {
  // Validate shared secret — rejects unauthenticated callers
  const secret = req.nextUrl.searchParams.get("secret");
  if (CALLBACK_SECRET && secret !== CALLBACK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ExecuteWebhookRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { token, status, stdout, stderr, compile_output, time, memory } = parsed.data;

  const supabase = serviceClient();

  // Look up the execution_run row by Judge0 token
  const { data: run, error: fetchErr } = await supabase
    .from("execution_runs")
    .select("id, session_id")
    .eq("judge0_token", token)
    .single();

  if (fetchErr || !run) {
    // Unknown token — log and ack so Judge0 doesn't retry forever
    console.warn("[execute/callback] unknown token:", token);
    return NextResponse.json({ ok: true });
  }

  const runId     = (run as { id: string; session_id: string }).id;
  const sessionId = (run as { id: string; session_id: string }).session_id;

  // Decode base64 fields (Judge0 base64-encodes output when base64_encoded=true)
  const stdoutText         = b64decode(stdout ?? null);
  const stderrText         = b64decode(stderr ?? null);
  const compileOutputText  = b64decode(compile_output ?? null);

  // Update execution_run with final result
  const { error: updateErr } = await supabase
    .from("execution_runs")
    .update({
      finished_at: new Date().toISOString(),
      stderr: stderrText ?? compileOutputText ?? null,
      test_results_json: {
        status,
        stdout: stdoutText,
        stderr: stderrText,
        compile_output: compileOutputText,
        time,
        memory,
      },
    })
    .eq("id", runId);

  if (updateErr) {
    console.error("[execute/callback] update failed:", updateErr.message);
  }

  // Broadcast result to the extension via Realtime
  supabase
    .channel(Channels.execution(runId))
    .send({
      type: "broadcast",
      event: "result",
      payload: {
        runId,
        sessionId,
        status,
        stdout: stdoutText,
        stderr: stderrText,
        compile_output: compileOutputText,
        time,
        memory,
      },
    })
    .catch((err: unknown) => console.error("[execute/callback] broadcast error:", err))
    .finally(() => supabase.removeAllChannels());

  return NextResponse.json({ ok: true });
}
