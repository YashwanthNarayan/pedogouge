# Pedagogue — Orchestrator Task Board

> **This file is the source of truth for cross-session coordination.**
> Update it whenever a task starts or completes.
> Orchestrator session reads this at the start of every response.

---

## Current Day / Phase

**Day 1 → transitioning to Day 2 work**
Date: 2026-04-21
3 parallel Claude sessions: P1 (extension+mobile), P2 (AI+voice+web), P3 (infra+backend)
Orchestrator session: 4th session, reads this file + assigns work + updates status.

---

## Completed Tasks (shipped + committed)

### P2 Session
- [x] T2-01 — All 6 Zod schemas + shared contracts (contract-v1 tag)
- [x] T2-02 — Anthropic client (caching, canary, refusal, retry)
- [x] T2-03 — Voyage client + multi-agent intake pipeline
- [x] T2-04 — Dual-track curriculum generator (Citations + pgvector)
- [x] T2-05 — Session overview + lesson page + credential page (basic structure)
- [x] T2-06 — Haiku stderr classifier + struggle pattern detector
- [x] T2-07 — Meta-agent intervention selector + tier 1-3/5 content generators
- [x] T2-08 — Defense WebRTC page (mic, VAD, audio-out, consent gate)
- [x] T2-09 — Deepgram streaming ASR client + turn manager scaffold
- [x] T2-10 — Defense interviewer: Claude streaming + fine-grained tool streaming + 3 tools
- [x] T2-11 — ElevenLabs streaming TTS + sentence buffer + barge-in
- [x] T2-12 — Defense UI polish (PhaseIndicator, BugPreview, keyboard shortcuts, teacher view, ARIA)

### P1 Session
- [x] T1-01 — Extension scaffold (package.json, tsconfig, esbuild, contributes)
- [x] T1-02 — @tutor Chat Participant with streaming reply + slash commands
- [x] T1-03 — Auth: SecretStorage, PKCE, AuthenticationProvider, URI handler

### P3 Session
- [x] T3-01 — Supabase migrations 001-010 (full schema + pgvector + HNSW + snapshot chain trigger)
- [x] T3-02 (partial) — RLS helpers (020_rls_helpers.sql) + pgvector matchChunks wrapper
- [x] T3-06 — match_chunks RPC (030_match_chunks.sql + lib/supabase/pgvector.ts)

---

## In Progress / Assigned

| Task | Assignee | Status | Depends On |
|------|----------|--------|-----------|
| T2-13 | P2 | NEXT | — |
| T2-14 | P2 | NEXT | T2-13 |
| T1-04 | P1 | NEXT | — |
| T1-05 | P1 | NEXT | — |
| T1-06 | P1 | blocked on T1-05 | T1-05 |
| T3-02 (full RLS policies) | P3 | URGENT | T3-01 ✅ |
| T3-05 | P3 | NEXT | T3-01 ✅ |
| T3-08 | P3 | NEXT | T3-01 ✅ |
| T3-18 | P3 | CRITICAL PATH | T3-01 ✅ |

---

## Critical Path (Demo Blockers)

Items without which the demo fails:

1. **T3-02 full RLS policies** — pnpm test:rls fails; all API routes return wrong data until done
2. **T3-03 Judge0 VM** — no real code execution (P3 needs DO droplet)
3. **T3-05 GitHub OAuth + extension token exchange** — extension can't authenticate to real backend
4. **T3-07 Fly.io y-websocket** — teacher dashboard has no live collab
5. **T3-14 defense-ws service** — voice defense won't work end-to-end (only mocked)
6. **T3-18 Ed25519 credential signing** — no real credentials
7. **T1-05+T1-06+T1-07** — no live diagnostics, the demo's "wow moment 4"
8. **T1-09 Pseudoterminal narrator** — no "wow moment 5"

---

## Parallel Work Map (what can run simultaneously)

```
P1                          P2                          P3
─────────────────────       ─────────────────────       ─────────────────────
T1-04 Mobile scaffold       T2-13 Citation polish        T3-02 RLS policies
T1-05 Tree-sitter loader    T2-14 Cost audit             T3-05 Auth routes
T1-06 Rules × 5 langs                                   T3-08 Snapshots API
T1-07 DiagCollection                                    T3-09 Judge0 pipeline
T1-08 Judge0 from ext     ← blocked on T3-09 ─────────  T3-18 Ed25519 signing
T1-09 Pty narrator                                      T3-03 Judge0 VM provision
T1-10 Lesson notebooks                                  T3-04 Voyage ingest
T1-11 DAP tracker                                       T3-07 y-websocket Fly.io
T1-12 Remote-edit apply   ← blocked on T3-12 ─────────  T3-12 Edit signing service
T1-13 Intervention tiers  ← blocked on P3 interventions T3-11 Teacher dashboard API
T1-14 Extension polish                                  T3-13 SM-2 edge fn
T1-15 Mobile complete                                   T3-14 defense-ws (Fly.io)
```

**Key insight:** P1 can run T1-04 through T1-11 independently of P3.
P3's highest-value next tasks are T3-02 (unblocks test suite) and T3-18 (credential demo).

---

## Remaining Tasks by Session

### P1 Remaining (T1-04 → T1-15)
- [ ] T1-04 Mobile app scaffold (Expo) — INDEPENDENT, start now
- [ ] T1-05 Tree-sitter WASM loader + 5 grammars — INDEPENDENT
- [ ] T1-06 20+ pedagogical rules — needs T1-05
- [ ] T1-07 DiagnosticCollection + Hover + CodeActions + Pty skeleton — needs T1-05
- [ ] T1-08 Judge0 submission from extension — needs T3-09
- [ ] T1-09 Pseudoterminal stderr narrator — needs T1-07, T2-06 (done ✅)
- [ ] T1-10 Lesson notebook + inline hints + CodeLens + snapshot ticker — needs T1-07
- [ ] T1-11 DAP tracker (tier 4 pair debug) — needs T1-07
- [ ] T1-12 Remote-edit apply (inject_bug) — needs T3-12
- [ ] T1-13 Intervention tier modals + Memory Store writer + Mobile SM-2 tab — needs T2-07 (done ✅)
- [ ] T1-14 Extension polish: hotkeys, crash recovery, prewarm, signed .vsix
- [ ] T1-15 Mobile: QR scan, credential viewer, offline verify, push notifs — needs T3-18

### P2 Remaining (T2-13 → T2-14)
- [ ] T2-13 Citation display in lessons + credential page render polish
- [ ] T2-14 Cost audit + retry/backoff + backup demo video

### P3 Remaining (T3-02 full → T3-20)
- [ ] T3-02 RLS policies (021_rls_policies.sql) — URGENT, pnpm test:rls blocked
- [ ] T3-03 Judge0 VM provision — requires user's DO account
- [ ] T3-04 Voyage ingest (500 KB chunks) — seeding
- [ ] T3-05 GitHub OAuth + extension token exchange API routes
- [ ] T3-07 y-websocket on Fly.io — requires user's Fly.io account
- [ ] T3-08 Snapshots API + demo session seeder
- [ ] T3-09 Judge0 multi-file zip pipeline
- [ ] T3-10 Judge0 webhook handler
- [ ] T3-11 Teacher dashboard backend + audit middleware
- [ ] T3-12 Rate limiter (Upstash) + broadcast helpers + edit-signing service
- [ ] T3-13 SM-2 edge function + Expo push
- [ ] T3-14 defense-ws on Fly.io (Turn Manager) — requires Fly.io account
- [ ] T3-15 Audio storage + purge cron
- [ ] T3-16 Coturn TURN server — shared with Judge0 VM
- [ ] T3-17 Blueprint-diff analyzer (Phase 1 seeds)
- [ ] T3-18 Ed25519 keypair + JWKS + W3C VC builder — CRITICAL PATH
- [ ] T3-19 /verify route + StatusList2021 revocation
- [ ] T3-20 Vercel deploy + runbooks + demo-day checklist

---

## Infrastructure that requires user action (cannot be automated)

These tasks need accounts / credentials the user must provide:

1. **Supabase project** — user creates at supabase.com → provides URL + anon key + service role key
2. **DO droplet** — user provisions via DigitalOcean console → SSH access for Judge0
3. **Fly.io** — `fly auth login` in terminal (then P3 can deploy y-websocket + defense-ws)
4. **Vercel** — `vercel link` in terminal (then P3 can deploy web app)
5. **API keys** — Anthropic, Voyage, Deepgram, ElevenLabs keys → go into .env.local + Vercel

---

## Session Assignment Protocol

When the orchestrator sends a task to a session, use this format in STANDUPS:

```
ASSIGNED → P{N}: {task-id} — {one-line description}
DEPENDS ON: {task-ids or "none"}
READY WHEN: {condition that means it's done}
```

---

## Orchestrator Prompt (paste this into the 4th Claude Code session)

```
ROLE: I am the Orchestrator for the Pedagogue hackathon. I coordinate across 3 parallel
Claude sessions (P1/extension, P2/AI+voice+web, P3/infra) to maximize progress toward
the Day 5 demo.

Read these files now in this order:
1. @CLAUDE.md — current state
2. @.claude/ORCHESTRATOR.md — task board
3. @docs/STANDUPS/2026-04-21.md — what's been done

My job is to:
- Track what each session has done
- Identify the critical path to the demo
- Assign the next highest-value task to each session
- Update ORCHESTRATOR.md when tasks complete
- Catch dependency conflicts before they cause wasted work
- Surface when user action is needed (infra provisioning, accounts, keys)

NEVER write code myself. My only file edits are:
- .claude/ORCHESTRATOR.md (task board updates)
- docs/STANDUPS/{date}.md (standup entries)
- CLAUDE.md "Today's open questions" section

When given an update like "P1 finished T1-05", I:
1. Move the task to Completed in ORCHESTRATOR.md
2. Check what was unblocked (T1-06, T1-07 become available)
3. Tell P1 what to do next
4. Tell P3 and P2 if anything changed for them

When given a status check "what should P1 do next?", I:
1. Read the current Parallel Work Map
2. Return: "P1's next task is T1-{N}: {description}. Start immediately, no blockers."

Current task assignments (as of 2026-04-21 evening):
- P1: start T1-04 (Mobile scaffold) and T1-05 (Tree-sitter loader) in parallel
- P2: start T2-13 (Citation polish + credential page render)
- P3: start T3-02 (full RLS policies) — URGENT; then T3-18 (Ed25519 signing)
```

---

## How to update this file

When a task completes:
1. Move it from "Remaining" to "Completed" above
2. Check the Parallel Work Map — what was unblocked?
3. Update the "In Progress / Assigned" table
4. Add a note in docs/STANDUPS/{today}.md

When a blocker appears:
1. Add it to "Today's open questions" in CLAUDE.md
2. Add it to the dependency column in the In Progress table
3. Tell the affected session to work on something else

---

_Last updated: 2026-04-21 (end of Day 1)_
