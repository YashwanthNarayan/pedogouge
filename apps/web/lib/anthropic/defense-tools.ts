import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Defense interviewer tools (3 total)
// Used during the 3-phase voice defense — T2-10
// ---------------------------------------------------------------------------

export const defenseTools: Anthropic.Tool[] = [
  {
    name: "inject_bug",
    description:
      "Apply a pedagogical bug to the student's code for Phase 2 of the defense. " +
      "Select the concept with the lowest mastery score that has a realistic bug variant. " +
      "The extension will present the edit to the student with a confirmation banner.",
    input_schema: {
      type: "object" as const,
      properties: {
        conceptId: {
          type: "string",
          description: "The concept node ID whose mastery is being tested via this bug.",
        },
        rationale: {
          type: "string",
          description:
            "One sentence explaining why this concept was chosen and what the bug tests.",
          maxLength: 200,
        },
      },
      required: ["conceptId", "rationale"],
      additionalProperties: false,
    },
  },
  {
    name: "score_counterfactual",
    description:
      "Record a rubric score for the student's Phase 3 counterfactual or scaling question response. " +
      "Call this after the student has finished answering each counterfactual question.",
    input_schema: {
      type: "object" as const,
      properties: {
        questionId: {
          type: "string",
          description: "Unique ID for this counterfactual question within the defense session.",
        },
        questionText: {
          type: "string",
          description: "The exact question that was asked.",
        },
        rubric: {
          type: "object",
          properties: {
            correctness: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Factual accuracy of the answer (0 = wrong, 1 = correct).",
            },
            reasoningDepth: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Quality of reasoning and explanation (0 = surface, 1 = deep).",
            },
            tradeoffAwareness: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Awareness of trade-offs, edge cases, and alternatives (0 = none, 1 = thorough).",
            },
          },
          required: ["correctness", "reasoningDepth", "tradeoffAwareness"],
          additionalProperties: false,
        },
        summary: {
          type: "string",
          description: "1-2 sentence summary of the student's answer quality.",
          maxLength: 300,
        },
      },
      required: ["questionId", "questionText", "rubric", "summary"],
      additionalProperties: false,
    },
  },
  {
    name: "end_phase",
    description:
      "Advance to the next defense phase. Call this when the current phase's objectives " +
      "have been met: Phase 1 after 3-5 blueprint questions, Phase 2 after the bug injection " +
      "and follow-up discussion, Phase 3 after scoring all counterfactuals.",
    input_schema: {
      type: "object" as const,
      properties: {
        currentPhase: {
          type: "string",
          enum: ["blueprint_interrogation", "bug_injection", "counterfactual"],
          description: "The phase that is ending.",
        },
        reason: {
          type: "string",
          description: "One sentence explaining why this phase is complete.",
          maxLength: 200,
        },
      },
      required: ["currentPhase", "reason"],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Zod schemas for validating tool inputs server-side before execution
// ---------------------------------------------------------------------------

import { z } from "zod";

export const InjectBugInput = z.object({
  conceptId: z.string().min(1),
  rationale: z.string().max(200),
});

export const ScoreCounterfactualInput = z.object({
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  rubric: z.object({
    correctness: z.number().min(0).max(1),
    reasoningDepth: z.number().min(0).max(1),
    tradeoffAwareness: z.number().min(0).max(1),
  }),
  summary: z.string().max(300),
});

export const EndPhaseInput = z.object({
  currentPhase: z.enum(["blueprint_interrogation", "bug_injection", "counterfactual"]),
  reason: z.string().max(200),
});

export type InjectBugInput = z.infer<typeof InjectBugInput>;
export type ScoreCounterfactualInput = z.infer<typeof ScoreCounterfactualInput>;
export type EndPhaseInput = z.infer<typeof EndPhaseInput>;
