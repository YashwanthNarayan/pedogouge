import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { EventKind, EventPayload, Channels } from "@pedagogue/shared";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const EventRequest = z.object({
  sessionId: z.string().uuid(),
  kind: EventKind,
  payload: EventPayload,
});

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.slice(7) ?? "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = EventRequest.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { sessionId, kind, payload } = parsed.data;

  const db = svc();

  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ownership check
  const { data: session } = await db
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const { data, error } = await db.from("events").insert({
    session_id: sessionId,
    kind,
    payload_json: payload,
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget Realtime broadcast — don't block the response
  const channelName = Channels.events(sessionId);
  db.channel(channelName)
    .send({ type: "broadcast", event: kind, payload })
    .catch(() => { /* non-fatal — DB row is the source of truth */ })
    .finally(() => db.removeAllChannels());

  return NextResponse.json({ eventId: data.id });
}
