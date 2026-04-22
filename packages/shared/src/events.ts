// Event kinds emitted to the events table + Realtime
import { z } from "zod";

export const EventKind = z.enum([
  "code_run",
  "test_pass",
  "test_fail",
  "concept_tagged",
  "mastery_updated",
  "intervention_fired",
  "intervention_completed",
  "stderr_narrated",
  "snapshot_written",
  "ast_diagnostic",
  "defense_start",
  "defense_phase_advance",
  "defense_complete",
  "credential_issued",
  "session_start",
  "session_finalize",
  "teacher_nudge_sent",
  "teacher_nudge_received",
]);

export type EventKind = z.infer<typeof EventKind>;

// Payload shapes per kind — keep payloads lean (no raw code)
export const EventPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("code_run"), lang: z.string(), exitCode: z.number() }),
  z.object({ kind: z.literal("test_pass"), conceptIds: z.array(z.string()), runId: z.string() }),
  z.object({
    kind: z.literal("test_fail"),
    conceptIds: z.array(z.string()),
    runId: z.string(),
    stderrHash: z.string(),
  }),
  z.object({ kind: z.literal("concept_tagged"), conceptId: z.string(), ruleId: z.string() }),
  z.object({
    kind: z.literal("mastery_updated"),
    conceptId: z.string(),
    before: z.number(),
    after: z.number(),
  }),
  z.object({
    kind: z.literal("intervention_fired"),
    tier: z.number().int().min(1).max(5),
    conceptId: z.string(),
    deliveryChannel: z.string(),
  }),
  z.object({
    kind: z.literal("intervention_completed"),
    interventionId: z.string(),
    outcome: z.string(),
  }),
  z.object({
    kind: z.literal("stderr_narrated"),
    conceptIds: z.array(z.string()),
    lang: z.string(),
  }),
  z.object({ kind: z.literal("snapshot_written"), thisHash: z.string(), fileCount: z.number() }),
  z.object({ kind: z.literal("ast_diagnostic"), ruleId: z.string(), conceptId: z.string() }),
  z.object({ kind: z.literal("defense_start") }),
  z.object({
    kind: z.literal("defense_phase_advance"),
    phase: z.enum(["blueprint_interrogation", "bug_injection", "counterfactual", "complete"]),
  }),
  z.object({ kind: z.literal("defense_complete"), overallScore: z.number() }),
  z.object({ kind: z.literal("credential_issued"), credentialId: z.string() }),
  z.object({ kind: z.literal("session_start") }),
  z.object({ kind: z.literal("session_finalize") }),
  z.object({ kind: z.literal("teacher_nudge_sent"), nudgeKind: z.string() }),
  z.object({ kind: z.literal("teacher_nudge_received"), nudgeKind: z.string() }),
]);

export type EventPayload = z.infer<typeof EventPayload>;
