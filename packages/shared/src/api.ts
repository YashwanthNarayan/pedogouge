// STUB — full route I/O types by P2 in T2-01
// See plan Appendix Q.3 for the contract surface.
import { z } from "zod";
import { ProjectBlueprint } from "./schemas/project-blueprint.js";
import { ASTDiagnostic } from "./schemas/ast-diagnostic.js";
import { InterventionDecision } from "./schemas/intervention-decision.js";
import { InterviewContext } from "./schemas/interview-context.js";

// POST /api/intake
export const IntakeRequest = z.object({ projectIdea: z.string().min(1).max(2000) });
export const IntakeResponse = z.object({ sessionId: z.string(), blueprint: ProjectBlueprint });

// POST /api/classify (stderr → concept IDs)
export const ClassifyRequest = z.object({
  stderrLine: z.string(),
  language: z.string(),
  sessionId: z.string(),
  contextLines: z.array(z.string()).optional(),
});
export const ClassifyResponse = z.object({
  conceptIds: z.array(z.object({ id: z.string(), confidence: z.number() })),
  suggestionMd: z.string(),
});

// POST /api/intervene
export const InterveneRequest = z.object({
  sessionId: z.string(),
  conceptId: z.string(),
  strugglePattern: z.enum(["none", "conceptual_gap", "integration", "surface_fix"]),
});
export const InterveneResponse = InterventionDecision;

// POST /api/execute
export const ExecuteRequest = z.object({
  sessionId: z.string(),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
  lang: z.enum(["python", "javascript", "typescript", "java", "cpp"]),
});
export const ExecuteResponse = z.object({ runId: z.string(), status: z.literal("queued") });

// POST /api/execute/webhook
export const ExecuteWebhookRequest = z.object({
  token: z.string(),
  status: z.object({ id: z.number(), description: z.string() }),
  stdout: z.string().nullable(),
  stderr: z.string().nullable(),
  compile_output: z.string().nullable(),
  time: z.string().nullable(),
  memory: z.number().nullable(),
});

// POST /api/snapshots
export const SnapshotRequest = z.object({
  sessionId: z.string(),
  ts: z.number(),
  files: z.record(z.string(), z.string()),
  diffFromPrev: z.unknown().optional(),
  prevHash: z.string(),
});
export const SnapshotResponse = z.object({ thisHash: z.string() });

// POST /api/ast-diagnostics
export const AstDiagnosticsRequest = z.object({
  sessionId: z.string(),
  diagnostics: z.array(ASTDiagnostic),
});

// POST /api/memory/write
export const MemoryWriteRequest = z.object({
  userId: z.string(),
  sessionId: z.string(),
  entries: z.array(z.object({ key: z.string(), value: z.unknown() })),
});

// GET /api/memory/read
export const MemoryReadResponse = z.object({
  entries: z.array(z.object({ key: z.string(), value: z.unknown() })),
});

// POST /api/defense/token
export const DefenseTokenRequest = z.object({ sessionId: z.string() });
export const DefenseTokenResponse = z.object({ token: z.string(), expiresAt: z.number() });

// POST /api/defense/score
export const DefenseScoreRequest = z.object({
  defenseSessionId: z.string(),
  phase: InterviewContext.shape.phase,
  rubric: z.object({
    correctness: z.number().min(0).max(1),
    reasoningDepth: z.number().min(0).max(1),
    tradeoffAwareness: z.number().min(0).max(1),
  }),
});

// POST /api/credentials/issue
export const CredentialIssueRequest = z.object({ sessionId: z.string() });
export const CredentialIssueResponse = z.object({
  credentialId: z.string(),
  credentialUrl: z.string().url(),
});

// POST /api/credential/[id]/verify
export const CredentialVerifyRequest = z.object({ credentialJson: z.unknown() });
export const CredentialVerifyResponse = z.object({
  valid: z.boolean(),
  checkedAt: z.string().datetime(),
  reason: z.string().optional(),
});

// POST /api/auth/extension-token
export const ExtensionTokenRequest = z.object({
  state: z.string(),
  code: z.string(),
  verifier: z.string(),
});
export const ExtensionTokenResponse = z.object({
  sessionToken: z.string(),
  userId: z.string(),
  expiresAt: z.number(),
});

// POST /api/auth/refresh
export const AuthRefreshRequest = z.object({ sessionToken: z.string() });
export const AuthRefreshResponse = z.object({ sessionToken: z.string(), expiresAt: z.number() });

// GET /api/sm2/due
export const Sm2DueResponse = z.object({
  items: z.array(
    z.object({
      conceptId: z.string(),
      conceptName: z.string(),
      nextDueAt: z.string().datetime(),
      ease: z.number(),
      intervalDays: z.number(),
    }),
  ),
});

// POST /api/sm2/mark-reviewed
export const Sm2MarkReviewedRequest = z.object({ conceptId: z.string(), grade: z.number().int().min(0).max(5) });

// POST /api/security/event
export const SecurityEventRequest = z.object({
  kind: z.string(),
  sessionId: z.string().optional(),
  reason: z.string(),
  timestamp: z.number(),
});

// POST /api/user/expo-token
export const ExpoTokenRequest = z.object({ token: z.string() });

// POST /api/chat
export const ChatRequest = z.object({
  sessionId: z.string(),
  message: z.string(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});
