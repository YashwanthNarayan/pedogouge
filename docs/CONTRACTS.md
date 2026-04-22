# Pedagogue — Integration Contracts

These are the integration surfaces that all three people work against. **Changes require a team sync and a `contract-change` PR with 2 approvals.**

## 1. Zod Schemas (`packages/shared/src/schemas/`)

| Schema | File | Used by |
|--------|------|---------|
| `ProjectBlueprint` | project-blueprint.ts | Extension (display), AI (intake output), API (intake route) |
| `ConceptNode` | concept-node.ts | Extension (graph), AI (mastery), DB (concept_nodes) |
| `ASTDiagnostic` | ast-diagnostic.ts | Extension (squiggles), AI (classifier) |
| `InterventionDecision` | intervention-decision.ts | AI (meta-agent), Extension (router), API |
| `InterviewContext` | interview-context.ts | Voice defense (state machine), DB (defense_sessions) |
| `VerifiableCredentialSubject` | verifiable-credential-subject.ts | Credential signer, web render, mobile |

Run `pnpm gen:schemas` after any schema edit to regenerate JSON Schema files.

## 2. API Route Types (`packages/shared/src/api.ts`)

Every Next.js API route has a matching Request + Response type. See the file for the full list.

## 3. Realtime Channel Names (`packages/shared/src/channels.ts`)

```ts
Channels.conceptNodes(sessionId)   // concept mastery updates → skill graph
Channels.interventions(sessionId)  // intervention decision → extension renderer
Channels.edits(sessionId)          // signed edit envelopes → extension applier
Channels.nudges(sessionId)         // teacher nudge → student editor
Channels.execution(runId)          // Judge0 result → extension results panel
Channels.snapshots(sessionId)      // snapshot write confirmations
```

## 4. Event Kinds (`packages/shared/src/events.ts`)

All events written to `events` table and broadcast via Realtime. See the file for discriminated union payloads.

## 5. Env Vars (`.env.example`)

Add all new env vars with descriptions to `.env.example` and CLAUDE.md "Commands" section.
