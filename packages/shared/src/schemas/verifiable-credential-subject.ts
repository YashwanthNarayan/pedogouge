// STUB — full implementation by P2 in T2-01
// See plan Appendix A for the complete zod schema definition.
import { z } from "zod";
import { ConceptNode } from "./concept-node.js";

export const VerifiableCredentialSubject = z.object({
  projectTitle: z.string(),
  conceptsDemonstrated: z.array(
    ConceptNode.pick({ id: true, name: true, masteryScore: true }),
  ),
  competencyRadar: z.record(z.string(), z.number().min(0).max(1)),
  proofOfStruggle: z.array(
    z.object({
      errorSignature: z.string(),
      fixDiff: z.string(),
      defenseAnswerId: z.string(),
    }),
  ),
  interviewSummary: z.object({
    phases: z.array(z.object({ phase: z.string(), questions: z.number().int() })),
    overallRubric: z.object({
      correctness: z.number(),
      reasoningDepth: z.number(),
      tradeoffAwareness: z.number(),
    }),
  }),
});

export type VerifiableCredentialSubject = z.infer<typeof VerifiableCredentialSubject>;
