import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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

// ---------------------------------------------------------------------------
// GET /api/defense/[sessionId]
// Returns the latest defense session state for the given learning session.
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
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

  const { data: defenseSess, error } = await supabase
    .from("defense_sessions")
    .select("id, phase, started_at, completed_at, overall_rubric_json")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!defenseSess) {
    return NextResponse.json({ error: "No defense session found" }, { status: 404 });
  }

  return NextResponse.json({
    sessionId,
    defenseSessionId: defenseSess.id,
    phase: defenseSess.phase,
    startedAt: defenseSess.started_at,
    completedAt: defenseSess.completed_at,
    overallRubricJson: defenseSess.overall_rubric_json,
  });
}
