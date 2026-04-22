# Pedagogue — Project Context (auto-loaded every Claude session)

## Current state
Day 1 of 5 — late evening. Substantial progress across all 3 sessions.
See docs/STANDUPS/2026-04-21.md for full breakdown. Full plan: .claude/plans/lazy-drifting-salamander.md
Orchestrator task board: .claude/ORCHESTRATOR.md

## One-paragraph project summary
Pedagogue is a closed-loop AI tutor for high-school CS. Students submit an assignment, we generate a learning plan + scaffold a starter repo, integrate deeply into VS Code as the @tutor chat participant, track mastery via tree-sitter + Haiku on every keystroke, run a 3-phase voice defense at the end, and issue a W3C Verifiable Credential. Full plan in .claude/plans/lazy-drifting-salamander.md.

## Hard architecture decisions (do NOT change without team sync)
- Primary surface: VS Code extension (Chat Participant API, `@tutor`)
- Backend: Next.js 15 on Vercel + Supabase (Postgres + pgvector + Realtime + RLS)
- Code exec: self-hosted Judge0 on 1 VM; local exec via extension's Pseudoterminal
- Collab: Yjs + y-websocket on Fly.io; Supabase Realtime Broadcast for nudges
- Voice: Deepgram + Claude streaming + ElevenLabs Flash; <1.2s turn latency
- Embeddings: Voyage voyage-code-3 (1024-dim halfvec)
- Credential: Ed25519 signed W3C VC v2.0 (NOT HMAC — we need third-party verify)
- Age gate: 16+ only
- Teacher scope: loose (sees everything in class) with teacher_view_audit log

## Module ownership
- packages/extension/  → P1
- apps/mobile/         → P1
- lib/anthropic/       → P2
- lib/voice/           → P2
- apps/web/session/**  → P2
- apps/web/credential/** → P2
- infra/**             → P3
- apps/web/api/**      → P3
- apps/web/class/**    → P3
- lib/supabase/        → P3
- lib/credential/      → P3
- lib/judge0/          → P3
- packages/shared/     → co-owned, ping before changing

## Integration contracts (frozen day 1)
- Zod: packages/shared/src/schemas/ — run `pnpm gen:schemas` after any edit
- DB: infra/supabase/migrations/ — one migration per PR, never edit applied ones
- API: packages/shared/src/api.ts
- Channels: packages/shared/src/channels.ts
- Env: .env.example — add new vars with descriptions

## Commands
- `pnpm i` — install everything (pnpm workspaces + Turbo)
- `pnpm dev` — run every package in watch
- `pnpm test` — vitest across monorepo
- `pnpm test:rls` — RLS policy matrix tests (P3 implements T3-02)
- `pnpm gen:schemas` — regenerate JSON schema from zod
- `pnpm seed:demo` — seed the demo session in Supabase
- `pnpm --filter pedagogue-extension build` — build .vsix
- `pnpm --filter @pedagogue/web dev` — run Next.js dev server

## pnpm PATH note
pnpm is installed at ~/Library/pnpm (user install via install script).
Always prefix: `export PNPM_HOME="/Users/yashwanth/Library/pnpm"; export PATH="$PNPM_HOME:$PATH"`

## Conventions
- Every Anthropic SDK call MUST include cache_control (see lib/anthropic/client.ts when created)
- Every Supabase table MUST have RLS; CI test `pnpm test:rls` verifies
- Every Next.js route MUST validate input with zod before DB access
- Never commit secrets; use SecretStorage (ext) or Vercel env (web)
- Conventional commits: feat(ext): ..., fix(ai): ..., chore(infra): ...
- Small PRs, merge to main daily

## Known gotchas (hard-won)
- Citations API is INCOMPATIBLE with JSON structured outputs (see plan P.4)
  → lessons: Markdown with Citations; metadata via separate Haiku call
- Chat Participant stream.progress() must be async — blocking freezes ext host
- Haiku concept classifier MUST return only IDs that exist in the current graph
- Judge0 callback webhooks are ~3s late on free tier — use self-host
- Voyage halfvec rows need HNSW with m=16, ef_construction=64 (tested)
- VS Code webview CSP must allowlist wss://*.supabase.co explicitly
- Extension tsconfig uses CommonJS + Node moduleResolution (vscode requires it)
- Shared package uses Bundler + ESM; .js extensions required in import paths

## Cross-cutting files — ping the owner before editing
- CLAUDE.md                         → ping all 3
- packages/shared/src/              → ping all 3
- infra/supabase/migrations/*       → P3
- lib/anthropic/client.ts (when created) → P2
- packages/extension/src/extension.ts   → P1

## What is actually built (as of end of Day 1)

### packages/shared — DONE ✅
All 6 Zod schemas, api.ts, channels.ts, events.ts — frozen as contract-v1.

### apps/web/lib/anthropic — DONE ✅ (P2)
client.ts, canary.ts, system-prompt.ts, models.ts, errors.ts, intake-pipeline.ts,
curriculum.ts, defense.ts, defense-tools.ts, intervention.ts, telemetry.ts
All tests passing (36+17+13+12+15+10 = 103 tests).

### apps/web/lib/voice — DONE ✅ (P2)
deepgram-client.ts, elevenlabs-client.ts, sentence-buffer.ts, turn-manager.ts

### apps/web/lib/embeddings — DONE ✅ (P2)
voyage-client.ts

### apps/web/lib/graph — DONE ✅ (P2)
struggle-patterns.ts

### apps/web/lib/supabase — PARTIAL (P3)
pgvector.ts ✅ (matchChunks RPC wrapper)
Server client stub exists.

### apps/web/app/api — PARTIAL (P3 owns, P2 authored 4 routes)
Implemented: /api/intake, /api/classify, /api/intervene, /api/lessons/[conceptId], /api/health
Empty stubs (need P3): /api/execute, /api/auth/*, /api/credential/*, /api/classes/*, /api/defense/*, /api/memory/*, /api/sm2/*, /api/snapshots, /api/security/*

### apps/web/app/session + defense — DONE ✅ (P2)
session/[id]/page.tsx, session/[id]/defense/page.tsx (with PhaseIndicator, BugPreview, keyboard shortcuts, teacher view, ARIA)
session/[id]/defense/complete/page.tsx
components/defense/{audio-in,audio-out,connection,transcript,phase-indicator,bug-preview}.ts(x)

### apps/web/app/credential — PARTIAL (P2)
credential/[id]/page.tsx + credential-client.tsx — basic structure, needs T2-13 polish

### infra/supabase/migrations — DONE ✅ (P3)
001-010 (full schema), 020 (RLS helpers), 030 (match_chunks RPC)
Missing: 021_rls_policies.sql (the actual per-table RLS policies — T3-02 not finished)

### packages/extension — PARTIAL (P1)
extension.ts ✅, auth/{provider,secrets,uri-handler}.ts ✅, chat/participant.ts ✅, backend/client.ts ✅
Empty stubs (need P1): ast/, diagnostics/, pty/, debug/, webview/, notebook/, ux/, realtime/, commands/

### apps/mobile — PARTIAL (P1)
Expo scaffold + tab layout ✅. Placeholder tabs (credentials, due, scan) — need T1-13, T1-15.

### lib/ dirs still empty (P3 work remaining)
lib/credential/, lib/judge0/, lib/rate-limit/, lib/auth/, lib/sm2/, lib/snapshots/, lib/teacher/, lib/edit-signing/, lib/yjs/

## Today's open questions
(ephemeral — edit freely; anyone can add/resolve)
- P3: RLS policies (021_rls_policies.sql) still needed — pnpm test:rls will fail until done
- P3: Judge0 VM not yet provisioned — no real code execution
- P1: Tree-sitter grammars not yet bundled — no live diagnostics yet
- P2: T2-13 and T2-14 pending (credential polish + cost audit)
