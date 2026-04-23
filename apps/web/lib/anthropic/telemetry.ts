import { z } from "zod";
import { call } from "./client";
import { assembleSystemPrompt } from "./system-prompt";
import { generateCanary } from "./canary";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConceptTag {
  id: string;
  confidence: number;
}

export interface ClassifyResult {
  conceptIds: ConceptTag[];
  suggestion_md: string;
}

// Minimal concept node shape we need for graph loading stub
export interface ConceptNodeStub {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Graph loader stub (P3 T3-01 replaces with real Supabase fetch)
// ---------------------------------------------------------------------------

async function loadConceptGraph(_sessionId: string): Promise<ConceptNodeStub[]> {
  // TODO (P3 T3-01): SELECT id, name FROM concept_nodes WHERE session_id = $1
  return [];
}

// ---------------------------------------------------------------------------
// Classify stderr line → concept IDs + suggestion
//
// Model:  Haiku 4.5 (high-volume, sub-500ms target)
// Safety: IDs not in the concept graph are filtered out before returning
// ---------------------------------------------------------------------------

const ClassifySchema = z.object({
  conceptIds: z.array(
    z.object({
      id: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  suggestion_md: z.string().max(300),
});

const CLASSIFY_EXTRA = `You are a CS pedagogy classifier. Given a single error line from a student's program, identify which concepts from the provided skill graph are being violated.

Rules:
1. Return ONLY concept IDs that appear literally in the <skill_graph> JSON. Never invent IDs.
2. Return at most 3 conceptIds, ordered by relevance.
3. suggestion_md must be ≤ 2 sentences, pedagogical (explain WHY not HOW to fix).
4. If no concept in the graph matches, return an empty conceptIds array.`;

export async function classifyStderr(input: {
  stderr_line: string;
  language: string;
  sessionId: string;
  context_lines?: string[];
}): Promise<ClassifyResult> {
  const graph = await loadConceptGraph(input.sessionId);

  const system = assembleSystemPrompt({
    role: "classify",
    canary: generateCanary(),
    graph: graph.length > 0 ? graph : undefined,
    extra: CLASSIFY_EXTRA,
  });

  const contextSection =
    input.context_lines && input.context_lines.length > 0
      ? `\nContext lines:\n${input.context_lines.join("\n")}`
      : "";

  const result = await call<z.infer<typeof ClassifySchema>>({
    model: "haiku",
    system,
    messages: [
      {
        role: "user",
        content: `<user_input>Language: ${input.language}\nStderr line: ${input.stderr_line}${contextSection}</user_input>`,
      },
    ],
    output_schema: ClassifySchema,
    max_tokens: 256,
  });

  // Safety: filter out any IDs the model hallucinated that aren't in the graph
  const graphIds = new Set(graph.map((n) => n.id));
  const filteredConceptIds =
    graph.length > 0
      ? result.parsed.conceptIds.filter((c) => graphIds.has(c.id))
      : result.parsed.conceptIds; // if no graph loaded, trust the model

  return {
    conceptIds: filteredConceptIds,
    suggestion_md: result.parsed.suggestion_md,
  };
}
