import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SnapshotRequest } from "@pedagogue/shared";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function stableHash(files: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
  );
  return crypto.createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function bearerId(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

export async function POST(req: NextRequest) {
  const token = bearerId(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SnapshotRequest.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { sessionId, ts, files, diffFromPrev, prevHash } = parsed.data;

  const db = svc();

  // Verify caller owns this session using their JWT
  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: session } = await db
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const thisHash = stableHash(files);

  const { data, error } = await db.from("editor_snapshots").insert({
    session_id: sessionId,
    ts: new Date(ts).toISOString(),
    files_json: files,
    diff_from_prev: diffFromPrev ?? null,
    prev_hash: prevHash,
    this_hash: thisHash,
  }).select("id").single();

  if (error) {
    // Chain violation from trigger
    if (error.message.includes("chain broken") || error.message.includes("prev_hash")) {
      return NextResponse.json({ error: "snapshot_chain_broken", detail: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ snapshotId: data.id, hash: thisHash });
}

export async function GET(req: NextRequest) {
  const token = bearerId(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get("sessionId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const before = searchParams.get("before"); // ISO timestamp cursor

  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const db = svc();

  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: session } = await db
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  let query = db
    .from("editor_snapshots")
    .select("id, ts, files_json, diff_from_prev, this_hash")
    .eq("session_id", sessionId)
    .order("ts", { ascending: false })
    .limit(limit + 1);

  if (before) query = query.lt("ts", before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hasMore = (data?.length ?? 0) > limit;
  const snapshots = (data ?? []).slice(0, limit);
  const nextCursor = hasMore ? snapshots[snapshots.length - 1]?.ts ?? null : null;

  return NextResponse.json({ snapshots, nextCursor });
}
