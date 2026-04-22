// STUB — full implementation by P2 in T2-01
// See plan Appendix A for the complete zod schema definition.
import { z } from "zod";

export const ASTDiagnostic = z.object({
  ruleId: z.string(),
  file: z.string(),
  line: z.number().int(),
  column: z.number().int(),
  severity: z.enum(["hint", "info", "warning", "error"]),
  message: z.string(),
  conceptId: z.string(),
  lessonLink: z.string().url().optional(),
});

export type ASTDiagnostic = z.infer<typeof ASTDiagnostic>;
