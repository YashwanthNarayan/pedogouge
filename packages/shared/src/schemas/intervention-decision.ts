// STUB — full implementation by P2 in T2-01
// See plan Appendix A for the complete zod schema definition.
import { z } from "zod";

export const InterventionDecision = z.object({
  tier: z.number().int().min(1).max(5),
  conceptId: z.string(),
  rationale: z.string().max(200),
  expectedDurationSeconds: z.number().int(),
  fallbackTierIfStillStuck: z.number().int().min(1).max(5),
  deliveryChannel: z.enum(["chat", "inline", "codelens", "notebook", "debug", "terminal"]),
});

export type InterventionDecision = z.infer<typeof InterventionDecision>;
