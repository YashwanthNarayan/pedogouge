# Pedagogue — Architecture Overview

Full design: `.claude/plans/lazy-drifting-salamander.md`

## Three Surfaces, One System

| Surface | Stack | Owner |
|---------|-------|-------|
| VS Code Extension | TypeScript + esbuild + vscode API | P1 |
| Web Dashboard | Next.js 15 + Vercel | P2 (UI) + P3 (API) |
| Terminal CLI | Node + Ink | P1 |
| Mobile Companion | Expo (React Native) | P1 |

## 10-Layer Closed Loop

```
A. Multi-Agent Intake       (parallel tool calls → ProjectBlueprint)
B. Dynamic DAG Skill Graph  (Bayesian mastery + decay, pgvector-backed)
C. Dual-Track Curriculum    (Voyage RAG + project injection + Citations)
D. In-Extension IDE Layer   (Chat Participant + diagnostics + pty + DAP)
E. Tree-Sitter + Haiku AST  (on-keystroke pedagogical squiggles)
F. Real-Time Cognitive State (struggle pattern classifier)
G. 5-Tier Intervention Engine (meta-agent + inline/chat/modal/DAP)
H. 3-Phase Voice Defense    (Deepgram ↔ Claude tools ↔ ElevenLabs)
I. Cross-Session Memory     (Managed Agents Memory Stores + SM-2)
J. Signed Verifiable Credential (W3C VC + Ed25519 + public URL)
```

## Key Services

| Service | Provider | Purpose |
|---------|----------|---------|
| LLM | Anthropic (Opus/Sonnet/Haiku) | All AI reasoning |
| Embeddings | Voyage voyage-code-3 | pgvector semantic search |
| Database | Supabase (Postgres + pgvector) | All persistent state |
| Realtime | Supabase Realtime | Live graph updates, nudges |
| Code execution | Self-hosted Judge0 | Sandboxed multi-language runs |
| Collaboration | Yjs + y-websocket (Fly.io) | Teacher live view |
| Voice ASR | Deepgram Nova-3 | Defense speech → text |
| Voice TTS | ElevenLabs Flash v2.5 | Defense text → speech |
| Credential signing | Ed25519 (jose) | W3C VC v2.0 |
| Rate limiting | Upstash Redis | Budget protection |

## ADRs

- [001 — VS Code extension as primary surface](DECISIONS/001-vscode-ext-as-primary.md)
- [002 — Ed25519 not HMAC for credential signing](DECISIONS/002-ed25519-not-hmac.md)
- [003 — Loose teacher scope with audit log](DECISIONS/003-loose-teacher-scope.md)
- [004 — Citations API incompatible with JSON structured output](DECISIONS/004-citations-incompatible-json.md)
- [005 — Self-hosted Judge0 over RapidAPI](DECISIONS/005-judge0-self-host.md)
