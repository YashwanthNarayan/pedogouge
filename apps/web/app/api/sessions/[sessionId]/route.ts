import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

const JWT_SECRET   = process.env.JWT_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      const { payload } = await jwtVerify(
        auth.slice(7),
        new TextEncoder().encode(JWT_SECRET),
      );
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

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

/**
 * GET /api/sessions/[sessionId]
 * Returns session state for the extension to initialize on activate().
 * Auth: session owner (bearer JWT from extension or Supabase cookie from web).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const supabase = svc();

  const { data: session, error } = await supabase
    .from("sessions")
    .select(
      "id, user_id, project_idea, blueprint_json, credential_url, finalized_at",
    )
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const s = session as {
    id: string;
    user_id: string;
    project_idea: string;
    blueprint_json: unknown;
    credential_url: string | null;
    finalized_at: string | null;
  };

  if (s.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Concept nodes for the extension's concept graph initialisation
  const { data: nodes } = await supabase
    .from("concept_nodes")
    .select("id, name, mastery_score, struggle_pattern, prerequisites")
    .eq("session_id", sessionId)
    .order("mastery_score");

  return NextResponse.json({
    sessionId: s.id,
    projectIdea: s.project_idea,
    blueprintJson: s.blueprint_json,
    conceptNodes: (nodes ?? []).map((n: Record<string, unknown>) => ({
      id: n.id,
      name: n.name,
      masteryScore: n.mastery_score,
      strugglePattern: n.struggle_pattern,
      prerequisites: n.prerequisites,
    })),
    credentialUrl: s.credential_url,
    finalizedAt: s.finalized_at,
  });
}
