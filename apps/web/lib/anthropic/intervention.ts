import { z } from "zod";
import { call } from "./client";
import { assembleSystemPrompt } from "./system-prompt";
import { generateCanary } from "./canary";
import { generateLesson } from "./curriculum";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeliveryChannel =
  | "chat"
  | "inline"
  | "codelens"
  | "notebook"
  | "debug"
  | "terminal";

export type StrugglePattern = "none" | "conceptual_gap" | "integration" | "surface_fix";

export const InterventionDecision = z.object({
  tier: z.number().int().min(1).max(5),
  conceptId: z.string(),
  rationale: z.string().max(200),
  expectedDurationSeconds: z.number().int().positive(),
  fallbackTierIfStillStuck: z.number().int().min(1).max(5),
  deliveryChannel: z.enum(["chat", "inline", "codelens", "notebook", "debug", "terminal"]),
});
export type InterventionDecision = z.infer<typeof InterventionDecision>;

export interface InterventionContent {
  content_md: string;
  payload?: unknown;
}

// MCQ payload for Tier 2 probes
export const MCQPayload = z.object({
  questions: z
    .array(
      z.object({
        q: z.string(),
        choices: z.array(z.string()).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string(),
      }),
    )
    .length(3),
});
export type MCQPayload = z.infer<typeof MCQPayload>;

// ---------------------------------------------------------------------------
// Concept node stub (P3 T3-01 fills this)
// ---------------------------------------------------------------------------

interface ConceptNode {
  id: string;
  name: string;
  masteryScore: number;
  prerequisites: string[];
  strugglePattern: StrugglePattern;
}

async function loadConceptGraph(_sessionId: string): Promise<ConceptNode[]> {
  // TODO (P3 T3-01): SELECT * FROM concept_nodes WHERE session_id = $1
  return [];
}

async function loadRecentInterventions(
  _sessionId: string,
  _opts: { conceptId: string; limit: number },
): Promise<Array<{ tier: number; outcome: string | null; ts: string }>> {
  // TODO (P3 T3-01): SELECT tier, outcome FROM interventions WHERE session_id = $1 AND concept_id = $2
  return [];
}

async function loadRecentErrors(
  _sessionId: string,
  _conceptId: string,
): Promise<string[]> {
  // TODO (P3 T3-01): SELECT DISTINCT stderr_line FROM events WHERE session_id = $1 ...
  return [];
}

async function loadProjectFiles(
  _sessionId: string,
): Promise<Array<{ path: string; content: string }>> {
  // TODO (P3 T3-01): SELECT starter_repo from sessions ...
  return [];
}

// ---------------------------------------------------------------------------
// System prompt extra for the meta-agent (plan Appendix B3)
// ---------------------------------------------------------------------------

const META_INTERVENTION_EXTRA = `You are a pedagogy intervention strategist. Choose the right tier and delivery channel based on:

TIER RULES:
1. First failure → Tier 1 (chat): Socratic nudge, gentle question
2. Same error 2+ times → Tier 2 (codelens/notebook): 3-question MCQ probe
3. MCQ probe failed or stagnant → Tier 3 (notebook): full micro-lesson with student's variable names
4. Tier 3 didn't unstick, student still stuck → Tier 4 (debug): DAP pair-debug session
5. conceptual_gap + unmastered prerequisite → Tier 5 (chat): regress to prerequisite first

DELIVERY CHANNEL RULES:
- chat: quick nudges, low friction
- codelens/notebook: structured learning exercises
- debug: live debugging session (high cost, high value)
- inline: subtle in-editor hints

Your response must conform exactly to the schema. rationale must be under 200 chars.`;

// ---------------------------------------------------------------------------
// selectIntervention — meta-agent (Sonnet 4.6)
// ---------------------------------------------------------------------------

export async function selectIntervention(input: {
  sessionId: string;
  conceptId: string;
  strugglePattern: StrugglePattern;
  preferredChannel?: DeliveryChannel;
}): Promise<InterventionDecision> {
  const [graph, recentInterventions, recentErrors] = await Promise.all([
    loadConceptGraph(input.sessionId),
    loadRecentInterventions(input.sessionId, { conceptId: input.conceptId, limit: 5 }),
    loadRecentErrors(input.sessionId, input.conceptId),
  ]);

  const node = graph.find((n) => n.id === input.conceptId) ?? {
    id: input.conceptId,
    name: input.conceptId,
    masteryScore: 0,
    prerequisites: [],
    strugglePattern: input.strugglePattern,
  };

  const system = assembleSystemPrompt({
    role: "meta-intervention",
    canary: generateCanary(),
    graph: graph.length > 0 ? graph : undefined,
    extra: META_INTERVENTION_EXTRA,
  });

  const payload = {
    node,
    strugglePattern: input.strugglePattern,
    recentErrors: recentErrors.slice(0, 3),
    recentInterventions,
    preferredChannel: input.preferredChannel ?? null,
  };

  const result = await call<InterventionDecision>({
    model: "sonnet",
    system,
    messages: [
      {
        role: "user",
        content: `<user_input>${JSON.stringify(payload)}</user_input>`,
      },
    ],
    output_schema: InterventionDecision,
    max_tokens: 512,
  });

  return result.parsed;
}

// ---------------------------------------------------------------------------
// Tier generators
// ---------------------------------------------------------------------------

async function generateNudge(
  decision: InterventionDecision,
  _sessionId: string,
): Promise<InterventionContent> {
  const system = assembleSystemPrompt({
    role: "tier1-nudge",
    canary: generateCanary(),
    extra:
      "You are generating a Socratic nudge for a student who made an error. " +
      "Write ONE concise question (≤2 sentences) that makes them think about WHY their approach is wrong. " +
      "Never give the answer or solution. Markdown output.",
  });

  const result = await call({
    model: "haiku",
    system,
    messages: [
      {
        role: "user",
        content: `<user_input>Concept struggling with: ${decision.conceptId}. Generate a Socratic nudge.</user_input>`,
      },
    ],
    max_tokens: 128,
  });

  return { content_md: result.parsed as unknown as string };
}

async function generateProbe(
  decision: InterventionDecision,
  _sessionId: string,
): Promise<InterventionContent> {
  const system = assembleSystemPrompt({
    role: "tier2-probe",
    canary: generateCanary(),
    extra:
      "Generate exactly 3 multiple-choice questions to diagnose a student's misconception about the given concept. " +
      "Each question: 4 choices (0-indexed), clear correct index, brief explanation of why that answer is correct. " +
      "Questions should probe understanding, not recall. Never reveal the answer in the question text.",
  });

  const result = await call<MCQPayload>({
    model: "haiku",
    system,
    messages: [
      {
        role: "user",
        content: `<user_input>Concept: ${decision.conceptId}. Generate 3 diagnostic MCQs.</user_input>`,
      },
    ],
    output_schema: MCQPayload,
    max_tokens: 512,
  });

  const payload = result.parsed;

  // Summary markdown for the chat view
  const content_md = payload.questions
    .map(
      (q, i) =>
        `**Q${i + 1}:** ${q.q}\n${q.choices.map((c, j) => `${j === q.correctIndex ? "✓" : "○"} ${c}`).join("\n")}`,
    )
    .join("\n\n");

  return { content_md, payload };
}

async function generateMicroLesson(
  decision: InterventionDecision,
  sessionId: string,
): Promise<InterventionContent> {
  // Reuse the full curriculum generator with the concept targeted
  const lesson = await generateLesson(sessionId, decision.conceptId);
  return {
    content_md: lesson.bodyMd,
    payload: { lesson },
  };
}

async function generateRegression(
  decision: InterventionDecision,
  _sessionId: string,
  graph: ConceptNode[],
): Promise<InterventionContent> {
  const node = graph.find((n) => n.id === decision.conceptId);
  const unmastered = (node?.prerequisites ?? []).filter((prereqId) => {
    const prereq = graph.find((n) => n.id === prereqId);
    return prereq && prereq.masteryScore < 0.6;
  });

  const prereqTarget = unmastered[0] ?? node?.prerequisites[0] ?? decision.conceptId;

  const system = assembleSystemPrompt({
    role: "tier5-regression",
    canary: generateCanary(),
    extra:
      "The student needs to review a prerequisite concept before proceeding. " +
      "Generate a brief (3-5 sentence) bridging explanation that connects the prerequisite to the current concept they're stuck on. " +
      "End with a clear instruction: 'Let's review X first, then come back to Y.'",
  });

  const result = await call({
    model: "opus",
    system,
    messages: [
      {
        role: "user",
        content: `<user_input>Student is stuck on: ${decision.conceptId}. They haven't mastered prerequisite: ${prereqTarget}. Generate a regression bridging message.</user_input>`,
      },
    ],
    max_tokens: 256,
  });

  return {
    content_md: result.parsed as unknown as string,
    payload: { prereqConceptId: prereqTarget },
  };
}

// ---------------------------------------------------------------------------
// generateTierContent — dispatch to the right generator
// ---------------------------------------------------------------------------

export async function generateTierContent(
  decision: InterventionDecision,
  sessionId: string,
): Promise<InterventionContent> {
  switch (decision.tier) {
    case 1:
      return generateNudge(decision, sessionId);
    case 2:
      return generateProbe(decision, sessionId);
    case 3:
      return generateMicroLesson(decision, sessionId);
    case 4:
      // Tier 4 is handled by the extension (DAP pair-debug); we just signal it
      return {
        content_md: "**Tier 4: Live pair-debug session**\nThe tutor will guide you step-by-step through the debugger.",
        payload: { action: "start_pair_debug", conceptId: decision.conceptId },
      };
    case 5: {
      const graph = await loadConceptGraph(sessionId);
      return generateRegression(decision, sessionId, graph);
    }
    default:
      return { content_md: "" };
  }
}
