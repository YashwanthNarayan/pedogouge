import { call } from "./client";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// generateSessionMemory — summarize a completed session into a Haiku memory
//
// Fetches session context in parallel, calls Haiku (no cache_control since
// per-session data changes every call), upserts to user_memories, and marks
// the session as having a memory written.
// ---------------------------------------------------------------------------

interface MemoryResult {
  memoryId: string;
  wordCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDB = any;

export async function generateSessionMemory(
  sessionId: string,
  userId: string,
  supabase: SupabaseClient<AnyDB>,
): Promise<MemoryResult> {
  // Parallel data fetch
  const [sessionRes, conceptsRes, interventionsRes, defenseRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("project_blueprint_json, started_at, ended_at")
      .eq("id", sessionId)
      .single(),
    supabase
      .from("concept_nodes")
      .select("id, name, mastery_score, total_attempts")
      .eq("session_id", sessionId)
      .order("mastery_score", { ascending: true })
      .limit(20),
    supabase
      .from("interventions")
      .select("concept_id, strategy, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("defense_sessions")
      .select("phase, completed_at, overall_rubric_json")
      .eq("session_id", sessionId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const session = sessionRes.data;
  const concepts = conceptsRes.data ?? [];
  const interventions = interventionsRes.data ?? [];
  const defense = defenseRes.data;

  // Build summary context for Haiku
  const conceptSummary = concepts
    .map((c) => `${c.name}: mastery=${c.mastery_score.toFixed(2)} (${c.total_attempts} attempts)`)
    .join(", ");

  const interventionSummary = interventions
    .map((i) => `${i.concept_id}:${i.strategy}`)
    .join(", ");

  const defensePhase = defense?.phase ?? "not started";
  const defenseCompleted = defense?.completed_at ? "yes" : "no";

  const userPrompt = [
    "Summarize this student's coding session in 3-5 sentences for long-term memory.",
    "Focus on: which concepts were practiced, where they struggled, what interventions helped, and defense performance.",
    "Be specific and factual. Do NOT provide advice or praise.",
    "",
    `Session: ${sessionId}`,
    `Blueprint: ${JSON.stringify(session?.project_blueprint_json ?? {}).slice(0, 300)}`,
    `Concepts (low→high mastery): ${conceptSummary || "none"}`,
    `Interventions (recent): ${interventionSummary || "none"}`,
    `Defense: phase=${defensePhase}, completed=${defenseCompleted}`,
  ].join("\n");

  const result = await call<string>({
    model: "haiku",
    system: [
      {
        type: "text",
        text: "You are a concise session summarizer for a CS tutoring platform. Output plain prose only — no JSON, no headers, no bullet points. 3-5 sentences maximum.",
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: 512,
    temperature: 0.2,
  });

  const memoryText = result.parsed.trim();
  const wordCount = memoryText.split(/\s+/).filter(Boolean).length;
  const modelId = "claude-haiku-4-5-20251001";

  // Upsert to user_memories ON CONFLICT (session_id)
  const { data: upserted, error: upsertErr } = await supabase
    .from("user_memories")
    .upsert(
      {
        user_id: userId,
        session_id: sessionId,
        memory_text: memoryText,
        model: modelId,
        // key/value_json kept null for session-type memories
        key: `session:${sessionId}`,
        value_json: { word_count: wordCount },
      },
      { onConflict: "session_id" },
    )
    .select("id")
    .single();

  if (upsertErr || !upserted) {
    throw new Error(upsertErr?.message ?? "Failed to upsert memory");
  }

  return { memoryId: upserted.id as string, wordCount };
}
