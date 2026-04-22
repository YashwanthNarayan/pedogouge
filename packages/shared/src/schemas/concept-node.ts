// STUB — full implementation by P2 in T2-01
// See plan Appendix A for the complete zod schema definition.
import { z } from "zod";

export const ConceptNode = z.object({
  id: z.string(),
  name: z.string(),
  prerequisites: z.array(z.string()),
  masteryScore: z.number().min(0).max(1),
  decayRate: z.number(),
  lastTestedAt: z.string().datetime().nullable(),
  relatedErrors: z.array(z.string()),
  strugglePattern: z.enum(["none", "conceptual_gap", "integration", "surface_fix"]),
});

export type ConceptNode = z.infer<typeof ConceptNode>;
