import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

const PHASE_MAP: Record<number, string> = {
  1: "blueprint_interrogation",
  2: "bug_injection",
  3: "counterfactual",
};

const PostBodySchema = z.object({
  phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  role: z.enum(["student", "tutor"]),
  text: z.string().min(1),
  audioUrl: z.string().url().optional(),
  toolCallsJson: z.unknown().optional(),
});

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user?.id ?? null;
}

function isServiceRequest(req: NextRequest): boolean {
  const secret = req.headers.get("x-service-secret");
  const wsSecret = process.env.DEFENSE_WS_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!(secret && (secret === wsSecret || secret === serviceKey));
}

// ---------------------------------------------------------------------------
// GET /api/defense/[sessionId]/turns
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Verify session ownership
  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find latest defense session
  const { data: defenseSess } = await supabase
    .from("defense_sessions")
    .select("id")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!defenseSess) {
    return NextResponse.json({ turns: [] });
  }

  const { data: turns, error } = await supabase
    .from("defense_turns")
    .select("id, phase, role, text, audio_url, tool_calls_json, ts")
    .eq("defense_session_id", defenseSess.id)
    .order("ts", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ turns: turns ?? [] });
}

// ---------------------------------------------------------------------------
// POST /api/defense/[sessionId]/turns
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  // Auth: service secret OR session owner
  const fromService = isServiceRequest(req);
  let userId: string | null = null;
  if (!fromService) {
    userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { phase, role, text, audioUrl, toolCallsJson } = parsed.data;
  const dbPhase = PHASE_MAP[phase];
  // DB constraint is ('student', 'interviewer')
  const dbRole = role === "tutor" ? "interviewer" : "student";

  const supabase = getServiceClient();

  // If authenticated user: verify session ownership
  if (userId) {
    const { data: session } = await supabase
      .from("sessions")
      .select("user_id")
      .eq("id", sessionId)
      .single();
    if (!session || session.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Find or create defense_session
  let defenseSessionId: string;
  const { data: existing } = await supabase
    .from("defense_sessions")
    .select("id")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    defenseSessionId = existing.id as string;
  } else {
    const { data: created, error: createErr } = await supabase
      .from("defense_sessions")
      .insert({ session_id: sessionId, phase: dbPhase })
      .select("id")
      .single();
    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create defense session" },
        { status: 500 },
      );
    }
    defenseSessionId = created.id as string;
  }

  const { data: turn, error: insertErr } = await supabase
    .from("defense_turns")
    .insert({
      defense_session_id: defenseSessionId,
      phase: dbPhase,
      role: dbRole,
      text,
      audio_url: audioUrl ?? null,
      tool_calls_json: toolCallsJson ?? null,
    })
    .select("id, ts")
    .single();

  if (insertErr || !turn) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ turnId: turn.id, ts: turn.ts }, { status: 201 });
}
