import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { SystemBlock } from "./canary";
import type { ProjectBlueprint, ConceptNode } from "@pedagogue/shared/schemas";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EditorSnapshot {
  filePath: string;
  content: string;
  capturedAt: string;
}

export const Phase1QuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  conceptId: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});
export type Phase1Question = z.infer<typeof Phase1QuestionSchema>;

export const InjectedBugSchema = z.object({
  conceptId: z.string(),
  filePath: z.string(),
  originalLine: z.string(),
  patchedLine: z.string(),
  bugDescription: z.string(),
  expectedFixHint: z.string(),
});
export type InjectedBug = z.infer<typeof InjectedBugSchema>;

export const CounterfactualSchema = z.object({
  id: z.string(),
  question: z.string(),
  conceptIds: z.array(z.string()),
});
export type Counterfactual = z.infer<typeof CounterfactualSchema>;

const ToolOutputSchema = z.object({
  conceptsCovered: z.array(z.string()),
  conceptsSkipped: z.array(z.string()),
  phase1Questions: z.array(Phase1QuestionSchema).min(5).max(8),
  phase2Bug: InjectedBugSchema,
  phase3Counterfactuals: z.array(CounterfactualSchema).length(3),
});

export interface BlueprintDiffInput {
  blueprint: ProjectBlueprint;
  editorSnapshots: EditorSnapshot[];
  conceptNodes: ConceptNode[];
  sessionId: string;
}

export interface BlueprintDiffOutput {
  conceptsCovered: string[];
  conceptsSkipped: string[];
  weakestConcept: ConceptNode;
  phase1Questions: Phase1Question[];
  phase2Bug: InjectedBug;
  phase3Counterfactuals: Counterfactual[];
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const PRODUCE_SEEDS_TOOL: Anthropic.Tool = {
  name: "produce_defense_seeds",
  description:
    "Analyze the gap between the project blueprint and the student's committed code. " +
    "Produce Phase 1 interrogation questions, a Phase 2 bug injection spec, and Phase 3 counterfactuals.",
  input_schema: {
    type: "object" as const,
    required: [
      "conceptsCovered",
      "conceptsSkipped",
      "phase1Questions",
      "phase2Bug",
      "phase3Counterfactuals",
    ],
    properties: {
      conceptsCovered: {
        type: "array",
        description: "Concept IDs from the blueprint that the student's code demonstrates.",
        items: { type: "string" },
      },
      conceptsSkipped: {
        type: "array",
        description:
          "Concept IDs from the blueprint absent or incomplete in the student's code.",
        items: { type: "string" },
      },
      phase1Questions: {
        type: "array",
        description:
          "5-8 voice-defense questions referencing specific blueprint/code discrepancies.",
        minItems: 5,
        maxItems: 8,
        items: {
          type: "object",
          required: ["id", "text", "conceptId", "difficulty"],
          properties: {
            id: { type: "string" },
            text: {
              type: "string",
              description: "Spoken question text (1-2 sentences max).",
            },
            conceptId: { type: "string" },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          },
        },
      },
      phase2Bug: {
        type: "object",
        description: "A single targeted bug injection for the lowest-mastery concept.",
        required: [
          "conceptId",
          "filePath",
          "originalLine",
          "patchedLine",
          "bugDescription",
          "expectedFixHint",
        ],
        properties: {
          conceptId: { type: "string" },
          filePath: {
            type: "string",
            description: "Relative path of the file to mutate.",
          },
          originalLine: {
            type: "string",
            description: "The exact line to replace (must match student's code).",
          },
          patchedLine: {
            type: "string",
            description: "The subtly-wrong replacement line.",
          },
          bugDescription: {
            type: "string",
            description: "Internal note explaining what the bug tests.",
          },
          expectedFixHint: {
            type: "string",
            description: "Hint to give the student if they are stuck.",
          },
        },
      },
      phase3Counterfactuals: {
        type: "array",
        description: "Exactly 3 scaling/extension counterfactual questions.",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          required: ["id", "question", "conceptIds"],
          properties: {
            id: { type: "string" },
            question: {
              type: "string",
              description: "Open-ended scaling or extension question.",
            },
            conceptIds: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// System prompt blocks — two cache segments
// ---------------------------------------------------------------------------

const ROLE_PREAMBLE = `You are the Blueprint-Diff Analyzer for Pedagogue, an AI tutor for high-school CS.

Given the original ProjectBlueprint (what the student was assigned to build) and their
actual committed code snapshots, your job is to:
1. Identify which blueprint concepts the student implemented vs. skipped.
2. Spot rewrite patterns, suspicious gaps, or copy-paste indicating shallow understanding.
3. Generate targeted Phase 1 interrogation questions, a Phase 2 bug injection spec (targeting
   the weakest concept), and Phase 3 counterfactual questions.

CONSTRAINTS:
- Call produce_defense_seeds — do not respond with prose.
- Keep all question text to 1-2 sentences (voice output, low latency).
- Use only concept IDs that appear in the blueprint's conceptGraph.
- The phase2Bug.originalLine must exactly match a line in the student's snapshot.`;

function buildSystemBlocks(
  blueprint: ProjectBlueprint,
  snapshots: EditorSnapshot[],
  conceptNodes: ConceptNode[],
): SystemBlock[] {
  return [
    {
      type: "text",
      // 1h TTL — blueprint is static for the session
      text: `${ROLE_PREAMBLE}\n\n<blueprint>${JSON.stringify(blueprint)}</blueprint>`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      // 5m TTL — snapshots and mastery change as the student works
      text: [
        `<snapshots>${JSON.stringify(snapshots)}</snapshots>`,
        `<concept_nodes>${JSON.stringify(conceptNodes)}</concept_nodes>`,
      ].join("\n"),
      cache_control: { type: "ephemeral" },
    },
  ];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function analyzeBlueprintDiff(
  input: BlueprintDiffInput,
): Promise<BlueprintDiffOutput> {
  const { blueprint, editorSnapshots, conceptNodes } = input;

  if (conceptNodes.length === 0) {
    throw new Error("analyzeBlueprintDiff: conceptNodes must not be empty");
  }

  const systemBlocks = buildSystemBlocks(blueprint, editorSnapshots, conceptNodes);

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemBlocks as Anthropic.TextBlockParam[],
    tools: [PRODUCE_SEEDS_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content:
          "Analyze the blueprint vs. the student's snapshots and call produce_defense_seeds with your findings.",
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "produce_defense_seeds",
  );
  if (!toolUse) {
    throw new Error("analyzeBlueprintDiff: model did not call produce_defense_seeds");
  }

  const toolOutput = ToolOutputSchema.parse(toolUse.input);

  // Derive weakestConcept from input rather than asking the LLM
  const weakestConcept = [...conceptNodes].sort(
    (a, b) => a.masteryScore - b.masteryScore,
  )[0]!;

  return {
    conceptsCovered: toolOutput.conceptsCovered,
    conceptsSkipped: toolOutput.conceptsSkipped,
    weakestConcept,
    phase1Questions: toolOutput.phase1Questions,
    phase2Bug: toolOutput.phase2Bug,
    phase3Counterfactuals: toolOutput.phase3Counterfactuals,
  };
}
