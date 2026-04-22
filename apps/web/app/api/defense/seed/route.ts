import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { analyzeBlueprintDiff, type EditorSnapshot } from "@/lib/anthropic/blueprint-diff";
import type { ConceptNode } from "@pedagogue/shared/schemas";
import type { ProjectBlueprint } from "@pedagogue/shared/schemas";

const SeedBody = z.object({ sessionId: z.string().uuid() });

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

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SeedBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { sessionId } = parsed.data;

  // Auth: must be the session owner
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Verify the user owns the session
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, project_blueprint_json, user_id")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blueprint = session.project_blueprint_json as ProjectBlueprint;
  if (!blueprint) {
    return NextResponse.json(
      { error: "Session has no blueprint — run intake first" },
      { status: 422 },
    );
  }

  // Fetch last 5 editor snapshots
  const { data: snapshotRows } = await supabase
    .from("snapshots")
    .select("file_path, content, captured_at")
    .eq("session_id", sessionId)
    .order("captured_at", { ascending: false })
    .limit(5);

  const editorSnapshots: EditorSnapshot[] = (snapshotRows ?? []).map((row) => ({
    filePath: row.file_path as string,
    content: row.content as string,
    capturedAt: row.captured_at as string,
  }));

  // Fetch concept nodes for this session
  const { data: conceptRows } = await supabase
    .from("concept_nodes")
    .select(
      "id, name, prerequisites, mastery_score, decay_rate, last_tested_at, related_errors, struggle_pattern",
    )
    .eq("session_id", sessionId);

  const conceptNodes: ConceptNode[] = (conceptRows ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    prerequisites: (row.prerequisites ?? []) as string[],
    masteryScore: (row.mastery_score as number) ?? 0,
    decayRate: (row.decay_rate as number) ?? 0.05,
    lastTestedAt: (row.last_tested_at as string | null) ?? null,
    relatedErrors: (row.related_errors ?? []) as string[],
    strugglePattern: ((row.struggle_pattern as string) ?? "none") as ConceptNode["strugglePattern"],
  }));

  if (conceptNodes.length === 0) {
    return NextResponse.json(
      { error: "No concept nodes found — concept graph must be seeded first" },
      { status: 422 },
    );
  }

  // Run the blueprint-diff analysis
  let seeds;
  try {
    seeds = await analyzeBlueprintDiff({
      blueprint,
      editorSnapshots,
      conceptNodes,
      sessionId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Blueprint-diff analysis failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  // Upsert into defense_sessions.overall_rubric_json with the seeds
  const { error: upsertErr } = await supabase.from("defense_sessions").upsert(
    {
      session_id: sessionId,
      phase: "blueprint_interrogation",
      overall_rubric_json: { seeds },
    },
    { onConflict: "session_id" },
  );

  if (upsertErr) {
    return NextResponse.json({ error: "Failed to persist seeds" }, { status: 500 });
  }

  return NextResponse.json({
    phase1Questions: seeds.phase1Questions,
    phase2Bug: seeds.phase2Bug,
    phase3Counterfactuals: seeds.phase3Counterfactuals,
    weakestConceptId: seeds.weakestConcept.id,
    conceptsCovered: seeds.conceptsCovered,
    conceptsSkipped: seeds.conceptsSkipped,
  });
}
