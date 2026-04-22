// STUB — full implementation by P2 in T2-01
// See plan Appendix A for the complete zod schema definition.
import { z } from "zod";

export const ProjectBlueprint = z.object({
  title: z.string(),
  summary: z.string().max(400),
  features: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      userStory: z.string(),
      acceptanceCriteria: z.array(z.string()),
      complexity: z.enum(["trivial", "easy", "medium", "hard"]),
      conceptIds: z.array(z.string()),
    }),
  ),
  dataModels: z.array(
    z.object({
      name: z.string(),
      fields: z.array(z.object({ name: z.string(), type: z.string() })),
    }),
  ),
  apiSurface: z.array(
    z.object({ method: z.string(), path: z.string(), purpose: z.string() }),
  ),
  conceptGraph: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      prerequisites: z.array(z.string()),
      estimatedMinutes: z.number(),
    }),
  ),
  scopedMvp: z.array(z.string()),
  ambiguities: z.array(z.string()),
  recommendedLanguage: z.enum(["python", "javascript", "typescript", "java", "cpp"]),
  starterRepo: z.object({
    files: z.array(z.object({ path: z.string(), content: z.string() })),
    testCmd: z.string(),
  }),
});

export type ProjectBlueprint = z.infer<typeof ProjectBlueprint>;
