import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { callStream } from "@/lib/anthropic/client";
import { assembleSystemPrompt } from "@/lib/anthropic/system-prompt";
import { rateLimit } from "@/lib/rate-limit";

const JWT_SECRET   = process.env.JWT_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

// Accepts both formats:
//   Extension sends: { sessionId, message, history }
//   Web sends:       { sessionId, messages, model }
const MessageShape = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const ChatBody = z
  .object({
    sessionId: z.string(),
    message: z.string().optional(),
    history: z.array(MessageShape).optional(),
    messages: z.array(MessageShape).optional(),
    model: z.enum(["opus", "sonnet", "haiku"]).optional(),
  })
  .refine(
    (d) => d.message !== undefined || (d.messages && d.messages.length > 0),
    { message: "Either message or messages is required" },
  );

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const bearer = auth.slice(7);
    try {
      const { payload } = await jwtVerify(
        bearer,
        new TextEncoder().encode(JWT_SECRET),
      );
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  // Cookie-based Supabase session (web app)
  try {
    const { createCookieClient } = await import("@/lib/teacher/middleware");
    const supabase = await createCookieClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();

function sseText(text: string): Uint8Array {
  // Encode newlines to keep each SSE event on one line
  const escaped = text.replace(/\n/g, "\\n");
  return encoder.encode(`data: ${escaped}\n\n`);
}

function sseDone(): Uint8Array {
  return encoder.encode("data: [DONE]\n\n");
}

function sseError(message: string): Uint8Array {
  return encoder.encode(`data: [ERROR] ${message}\n\n`);
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Rate limit (20/min AI tier) ─────────────────────────────────────────
  const rl = await rateLimit(userId, "ai");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ChatBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId, model } = parsed.data;

  // Normalise to a flat messages array
  const allMessages =
    parsed.data.messages ??
    [
      ...(parsed.data.history ?? []),
      { role: "user" as const, content: parsed.data.message! },
    ];

  // ── Fetch session context ────────────────────────────────────────────────
  const supabase = svc();

  const [sessionRes, nodesRes, eventsRes, memoriesRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("user_id, blueprint_json, project_idea")
      .eq("id", sessionId)
      .single(),
    supabase
      .from("concept_nodes")
      .select("id, name, mastery_score, struggle_pattern, prerequisites")
      .eq("session_id", sessionId)
      .order("mastery_score"),
    supabase
      .from("events")
      .select("kind, payload_json, ts")
      .eq("session_id", sessionId)
      .order("ts", { ascending: false })
      .limit(20),
    supabase
      .from("user_memories")
      .select("key, value_json")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(3),
  ]);

  if (!sessionRes.data) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const session = sessionRes.data as {
    user_id: string;
    blueprint_json: unknown;
    project_idea: string;
  };

  if (session.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conceptNodes = nodesRes.data ?? [];
  const recentEvents = eventsRes.data ?? [];
  const memories = (memoriesRes.data ?? []) as Array<{
    key: string;
    value_json: unknown;
  }>;

  // ── Build system prompt ──────────────────────────────────────────────────
  const systemPrompt = assembleSystemPrompt({
    role: "@tutor — conversational pedagogical assistant. Guide the student with Socratic questioning. Never give complete solutions.",
    blueprint: session.blueprint_json,
    graph: conceptNodes,
    events: recentEvents.length > 0 ? recentEvents : undefined,
    userMemories: memories.map((m) => `${m.key}: ${JSON.stringify(m.value_json)}`),
  });

  // ── Model selection ──────────────────────────────────────────────────────
  const modelKey =
    model === "opus" ? "opus" : model === "haiku" ? "haiku" : "sonnet";

  // ── Fire-and-forget: log chat_turn event ─────────────────────────────────
  supabase
    .from("events")
    .insert({
      session_id: sessionId,
      kind: "chat_turn",
      payload_json: { model: modelKey, messageCount: allMessages.length },
    })
    .then(({ error }) => {
      if (error) console.error("[chat] event insert failed:", error.message);
    });

  // ── Stream via Anthropic ─────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = callStream({
          model: modelKey,
          system: systemPrompt,
          messages: allMessages,
          max_tokens: 2048,
        });

        for await (const chunk of gen) {
          controller.enqueue(sseText(chunk));
        }

        controller.enqueue(sseDone());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(sseError(msg));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
