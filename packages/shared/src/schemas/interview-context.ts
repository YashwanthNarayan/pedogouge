// STUB — full implementation by P2 in T2-01
// See plan Appendix A for the complete zod schema definition.
import { z } from "zod";

export const InterviewContext = z.object({
  phase: z.enum(["blueprint_interrogation", "bug_injection", "counterfactual", "complete"]),
  askedQuestions: z.array(
    z.object({ id: z.string(), text: z.string(), phase: z.string() }),
  ),
  answers: z.array(
    z.object({
      questionId: z.string(),
      answerText: z.string(),
      audioUrl: z.string().url().optional(),
      rubricScore: z.object({
        correctness: z.number().min(0).max(1),
        reasoningDepth: z.number().min(0).max(1),
        tradeoffAwareness: z.number().min(0).max(1),
      }),
    }),
  ),
  injectedBug: z
    .object({
      conceptId: z.string(),
      originalCode: z.string(),
      mutatedCode: z.string(),
      studentFixed: z.boolean(),
      fixDiff: z.string().optional(),
    })
    .nullable(),
  counterfactuals: z.array(
    z.object({
      prompt: z.string(),
      response: z.string(),
      score: z.number(),
    }),
  ),
});

export type InterviewContext = z.infer<typeof InterviewContext>;
