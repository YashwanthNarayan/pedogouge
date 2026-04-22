import { z } from "zod";
import { call, callWithCitations } from "./client";
import { assembleSystemPrompt } from "./system-prompt";
import { generateCanary } from "./canary";
import { Models } from "./models";
import { embed } from "@/lib/embeddings/voyage-client";
import { matchChunks } from "@/lib/supabase/pgvector";
import type { MatchedChunk } from "@/lib/supabase/pgvector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const LessonMetadata = z.object({
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  prerequisiteConceptIds: z.array(z.string()),
  runnableCells: z.array(z.object({ lang: z.string(), code: z.string() })),
  estimatedMinutes: z.number().int().positive(),
});
export type LessonMetadata = z.infer<typeof LessonMetadata>;

export interface Lesson {
  conceptId: string;
  bodyMd: string;
  plainText: string;
  citations: Array<{ id: string; source: string; excerpt: string }>;
  metadata: LessonMetadata;
}

// ---------------------------------------------------------------------------
// Session data loaders (stubs until P3 ships real Supabase client)
// ---------------------------------------------------------------------------

interface ConceptNode {
  id: string;
  name: string;
  prerequisites: string[];
  masteryScore: number;
}

interface Blueprint {
  title: string;
  recommendedLanguage: string;
  starterRepo: { files: Array<{ path: string; content: string }>; testCmd: string };
  conceptGraph: ConceptNode[];
}

async function loadBlueprintForSession(_sessionId: string): Promise<Blueprint | null> {
  // TODO (P3 T3-01): fetch from sessions.blueprint_json via Supabase
  return null;
}

async function loadConceptNode(
  _sessionId: string,
  _conceptId: string,
): Promise<ConceptNode | null> {
  // TODO (P3 T3-01): fetch from concept_nodes via Supabase
  return null;
}

// ---------------------------------------------------------------------------
// Build the lesson body system prompt (plan B2)
// ---------------------------------------------------------------------------

const CURRICULUM_EXTRA = `You are a CS pedagogy expert generating a lesson for a high-school student.

Structure every lesson as:
1. **Motivation** (2 sentences) — why this concept matters for their specific project
2. **Core explanation** — clear prose, grounded in the attached KB chunks via Citations
3. **Worked example** — use the student's own variable names and project context
4. **Common misconception** — one specific wrong mental model and why it fails
5. **Self-check** — one multiple-choice question (4 options, label the correct one)

Rules:
- Every factual claim MUST be grounded in an attached KB chunk via Citations
- Use the student's project variable names and file names in examples, not generic "foo/bar"
- Keep total length under 600 words
- Output Markdown only (no JSON, no code fences around the full response)
- Runnable code cells go inside triple-backtick fences with the language tag`;

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function generateLesson(sessionId: string, conceptId: string): Promise<Lesson> {
  // Load session data in parallel
  const [blueprint, concept] = await Promise.all([
    loadBlueprintForSession(sessionId),
    loadConceptNode(sessionId, conceptId),
  ]);

  const conceptName = concept?.name ?? conceptId;
  const language = blueprint?.recommendedLanguage ?? "python";
  const projectFiles = blueprint?.starterRepo?.files ?? [];

  // ---------------------------------------------------------------------------
  // Track 1: Retrieve KB chunks via Voyage embed + pgvector KNN
  // ---------------------------------------------------------------------------

  let chunks: MatchedChunk[] = [];
  try {
    const queryText = `${conceptName} for ${language} beginners`;
    const [queryVec] = await embed([queryText], { inputType: "query" });
    chunks = await matchChunks(queryVec!, { k: 5, conceptFilter: conceptId });
    // Fall back to broader search if no concept-specific chunks exist
    if (chunks.length === 0) {
      chunks = await matchChunks(queryVec!, { k: 5 });
    }
  } catch {
    // Non-fatal: lesson still generated without RAG grounding
  }

  // ---------------------------------------------------------------------------
  // Track 2: Project artifacts as context (student's own code)
  // ---------------------------------------------------------------------------

  const projectContext =
    projectFiles.length > 0
      ? projectFiles
          .slice(0, 5) // cap to avoid token bloat
          .map((f) => `// ${f.path}\n${f.content}`)
          .join("\n\n---\n\n")
      : `// No starter repo yet — use generic ${language} examples`;

  // ---------------------------------------------------------------------------
  // Call 1: Opus + Citations API → lesson body (Markdown)
  // Citations API is INCOMPATIBLE with response_format — body is plain Markdown
  // ---------------------------------------------------------------------------

  const system = assembleSystemPrompt({
    role: "curriculum",
    canary: generateCanary(),
    blueprint: blueprint ?? undefined,
    extra: CURRICULUM_EXTRA,
  });

  const userContent: Array<{
    type: string;
    [key: string]: unknown;
  }> = [];

  // Attach KB chunks as citable documents
  for (const [i, chunk] of chunks.entries()) {
    userContent.push({
      type: "document",
      source: { type: "text", data: chunk.body_md, media_type: "text/plain" },
      citations: { enabled: true },
      title: `KB chunk ${i + 1}: ${chunk.concept_id} (${chunk.difficulty ?? "general"})`,
    });
  }

  // Attach project files as a non-citable document (just context, not a source)
  userContent.push({
    type: "document",
    source: { type: "text", data: projectContext, media_type: "text/plain" },
    title: "Student project files",
  });

  // The actual instruction
  userContent.push({
    type: "text",
    text: `<user_input>Generate a lesson for this concept: "${conceptName}" (id: ${conceptId}).\nProject language: ${language}.\nUse the student's variable names from the project files in your worked example.</user_input>`,
  });

  const lessonBody = await callWithCitations({
    model: "opus",
    system,
    messages: [{ role: "user", content: userContent as never }],
    max_tokens: 2048,
  });

  // ---------------------------------------------------------------------------
  // Call 2: Haiku → lesson metadata (structured output)
  // Separate call because Citations ⊥ JSON response_format (ADR 004)
  // ---------------------------------------------------------------------------

  const metadataResult = await call<LessonMetadata>({
    model: "haiku",
    system: assembleSystemPrompt({
      role: "curriculum-meta",
      canary: generateCanary(),
      extra:
        "Extract structured metadata from the lesson text. Return only JSON matching the schema. " +
        "prerequisiteConceptIds must only reference concept IDs found in the concept graph if provided.",
    }),
    messages: [
      {
        role: "user",
        content: `<user_input>Extract metadata from this lesson:\n\n${lessonBody.plainText}\n\nConcept graph (for prerequisite validation):\n${JSON.stringify(blueprint?.conceptGraph ?? [])}</user_input>`,
      },
    ],
    output_schema: LessonMetadata,
    max_tokens: 512,
    temperature: 0.1,
  });

  return {
    conceptId,
    bodyMd: lessonBody.markdown,
    plainText: lessonBody.plainText,
    citations: lessonBody.citations,
    metadata: metadataResult.parsed,
  };
}

// ---------------------------------------------------------------------------
// Exports for caching layer (used by route handler)
// ---------------------------------------------------------------------------

export type { MatchedChunk };
export { Models };
