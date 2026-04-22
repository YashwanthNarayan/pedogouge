import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";
import { ExecuteRequest, ExecuteResponse } from "@pedagogue/shared";
import { rateLimit } from "@/lib/rate-limit";
import { executeFiles } from "@/lib/judge0";

const JWT_SECRET        = process.env.JWT_SECRET ?? "";
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const APP_URL           = process.env.NEXT_PUBLIC_APP_URL ?? "";
const CALLBACK_SECRET   = process.env.JUDGE0_CALLBACK_SECRET ?? "";
const MOCK_EXECUTE      = process.env.PEDAGOGUE_MOCK_EXECUTE === "true";

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  // Auth: verify extension session JWT
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearer) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }

  let userId: string;
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(bearer, secret);
    if (!payload.sub) throw new Error("no sub");
    userId = payload.sub;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // Rate limit by userId
  const rl = await rateLimit(userId, "api");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.reset),
        },
      },
    );
  }

  // Validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ExecuteRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId, files, lang } = parsed.data;

  // Verify session ownership
  const supabase = serviceClient();
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .single();

  if (sessErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if ((session as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (MOCK_EXECUTE) {
    return NextResponse.json(
      ExecuteResponse.parse({ runId: "00000000-mock-0000-0000-000000000000", status: "queued" }),
    );
  }

  // Derive entrypoint from first file matching the language extension
  const EXT: Record<string, string[]> = {
    python: [".py"],
    javascript: [".js", ".mjs"],
    typescript: [".ts", ".tsx"],
    java: [".java"],
    cpp: [".cpp", ".cc", ".cxx"],
    c: [".c"],
  };
  const exts = EXT[lang] ?? [];
  const entrypoint =
    files.find((f) => exts.some((e) => f.path.endsWith(e)))?.path ??
    files[0]?.path ??
    "main.py";

  // Build callback URL (Judge0 will POST the result here)
  const callbackUrl = CALLBACK_SECRET
    ? `${APP_URL}/api/execute/callback?secret=${encodeURIComponent(CALLBACK_SECRET)}`
    : undefined;

  try {
    const result = await executeFiles(
      { sessionId, files, entrypoint, lang, callbackUrl },
      supabase,
    );

    return NextResponse.json(
      ExecuteResponse.parse({ runId: result.runId, status: "queued" }),
    );
  } catch (err) {
    console.error("[execute] error:", err);
    return NextResponse.json({ error: "Execution submission failed" }, { status: 502 });
  }
}
