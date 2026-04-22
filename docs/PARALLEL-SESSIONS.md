# Parallel Claude Code Sessions — Day 1

Open 2 new Claude Code sessions in the same repo (`/Users/yashwanth/pedagogue`).
Each session works a different role. This session stays as P2.

---

## This session → P2 (AI + Voice + Web UI)
Already running. Will continue with T2-04 (curriculum generator).

---

## New Session 1 → P3 (Backend / Infra)

**Open a new Claude Code window, `cd` into `/Users/yashwanth/pedagogue`, then paste this entire block:**

```
ROLE: I am Person 3 (Backend infra lead) on the Pedagogue hackathon team.

Read @CLAUDE.md now before doing anything else. Then read the task below.

EXCLUSIVE OWNERSHIP: infra/, apps/web/app/api/**, lib/supabase/, lib/credential/, lib/judge0/
DO NOT TOUCH: packages/extension/, apps/mobile/, lib/anthropic/, lib/voice/, apps/web/lib/anthropic/

MY FIRST TASK IS T3-01:

Create Supabase migrations for the full schema described in the plan at
.claude/plans/lazy-drifting-salamander.md (section "Data Model"). No actual
Supabase project yet — just write the SQL migration files locally so they are
ready to `supabase db push` when we provision the project.

Create these files in order:
  infra/supabase/migrations/001_enable_extensions.sql
  infra/supabase/migrations/002_users_and_classes.sql
  infra/supabase/migrations/003_sessions_and_concepts.sql
  infra/supabase/migrations/004_kb_chunks.sql
  infra/supabase/migrations/005_ide_activity.sql   (editor_snapshots WITH hash-chain trigger, ast_diagnostics, terminal_commands, execution_runs, events)
  infra/supabase/migrations/006_pedagogy.sql       (lessons, interventions, sm2_schedule)
  infra/supabase/migrations/007_defense.sql        (defense_sessions, defense_turns)
  infra/supabase/migrations/008_credentials.sql    (credentials, credential_audit)
  infra/supabase/migrations/009_collab.sql         (yjs_docs, teacher_nudges, teacher_view_audit)
  infra/supabase/migrations/010_misc.sql           (user_memories, security_events, usage_records, consents)

Key requirements from the plan:
- pgvector: concept_nodes.embedding and kb_chunks.embedding are halfvec(1024)
- HNSW indexes: m=16, ef_construction=64, halfvec_cosine_ops on both embedding columns
- editor_snapshots: include prev_hash + this_hash columns + a BEFORE INSERT trigger
  (verify_snapshot_chain) that rejects broken chains
- All timestamps: timestamptz
- Soft deletes on users and sessions (deleted_at column)
- class_memberships needs: visibility_accepted_at, visibility_consent_version, visibility_revoked_at

After writing all migrations, also create:
  infra/supabase/migrations/020_rls_helpers.sql
    - is_teacher_of_class(cid uuid) SECURITY DEFINER function per plan P.2

ALSO create the pgvector KNN RPC that P2 needs urgently:
  infra/supabase/migrations/030_match_chunks.sql
    - match_chunks(query_vec halfvec(1024), k int, concept_filter text, difficulty_filter text)
      returns table(id, concept_id, body_md, source_url, difficulty, similarity float)
      STABLE, grant to authenticated

ALSO create the TypeScript wrapper:
  apps/web/lib/supabase/pgvector.ts
    - exports matchChunks(queryEmbedding: number[], opts) returning MatchedChunk[]
    - exports a basic supabase server client (reads from env vars)
    - use @supabase/supabase-js

Use TaskCreate to track subtasks as you go.
Commit when done: "feat(infra): supabase migrations + rls helpers + match_chunks rpc"
```

---

## New Session 2 → P1 (Extension)

**Open a second new Claude Code window, `cd` into `/Users/yashwanth/pedagogue`, then paste this entire block:**

```
ROLE: I am Person 1 (VS Code Extension lead) on the Pedagogue hackathon team.

Read @CLAUDE.md now before doing anything else. Then read the task below.

EXCLUSIVE OWNERSHIP: packages/extension/, apps/mobile/
DO NOT TOUCH: apps/web/app/api/**, lib/anthropic/, lib/supabase/, infra/

MY FIRST TASK IS T1-03: Auth — SecretStorage, AuthenticationProvider, PKCE URI handler

Files to create:
  packages/extension/src/auth/secrets.ts
  packages/extension/src/auth/uri-handler.ts
  packages/extension/src/auth/provider.ts
  packages/extension/src/commands/sign-in.ts
  packages/extension/src/commands/sign-out.ts
  Update packages/extension/src/extension.ts to wire everything up

Requirements (from .claude/plans/lazy-drifting-salamander.md task T1-03):

1. secrets.ts — typed SecretStorage wrapper
   - Keys: "pedagogue.sessionToken", "auth:pending:{state}"
   - Methods: store(key, value), get(key), delete(key)
   - NEVER log token values

2. uri-handler.ts — vscode.window.registerUriHandler for vscode://pedagogue.pedagogue/callback
   - Validate: path === "/callback", state matches a pending entry (< 5min old), code matches regex [a-zA-Z0-9_-]{40,60}
   - On valid: POST to {backendUrl}/api/auth/extension-token with {state, code, verifier}
   - On 200: store sessionToken via secrets.ts, fire onDidChangeSessions
   - On non-200: show error toast (status code only, no response body)
   - On invalid state: log to console, do nothing (no toast — prevents oracle attack)
   - On valid flow: delete the pending entry (anti-replay)

3. provider.ts — vscode.authentication.registerAuthenticationProvider("pedagogue", "Pedagogue", provider)
   - getSessions(scopes): return current session from secrets, or []
   - createSession(scopes): run PKCE sign-in flow (open browser), return session
   - removeSession(id): delete from secrets
   - Fire onDidChangeSessions appropriately

4. PKCE sign-in flow (inside createSession / sign-in command):
   a. Generate state = 32 random hex chars
   b. Generate verifier = 43-128 random base64url chars
   c. Generate challenge = base64url(sha256(verifier))
   d. Store state + verifier in secrets as "auth:pending:{state}" with timestamp
   e. Open vscode.env.openExternal(Uri.parse(`${backendUrl}/auth/extension?state={state}&challenge={challenge}`))
   f. URI handler will receive the callback and complete the flow

5. sign-in.ts — command "pedagogue.signIn"
   - If PEDAGOGUE_MOCK_AUTH=true: store "dev-token-{randomUUID()}" as sessionToken, show info message "Signed in (mock mode)"
   - Otherwise: call createSession() from the AuthenticationProvider

6. sign-out.ts — command "pedagogue.signOut"
   - Delete sessionToken from secrets
   - Fire onDidChangeSessions with removed session

7. Update extension.ts:
   - Replace stub signIn/signOut command handlers with real imports
   - Register the URI handler
   - Register the AuthenticationProvider
   - Export the sessionId setter so participant.ts can update it on sign-in

Security rules (inviolable):
- Never write tokens to globalState, workspaceState, or outputChannel
- URI handler rejects unknown state silently (no error toast — prevents state enumeration)
- Pending entries expire after 5 minutes
- The exchanged session token is ONLY stored in context.secrets

After writing the files, run:
  pnpm --filter pedagogue-extension build
and confirm it compiles clean (dist/extension.js produced, no TS errors).

Use TaskCreate to track subtasks.
Commit when done: "feat(ext): pkce auth flow + secretstorage + authentication-provider"
```

---

## Coordination rules across all 3 sessions

1. **Don't edit the same file.** Ownership above is strict.
2. **packages/shared/ is frozen** — don't change schemas or api.ts without pinging the other sessions.
3. **P3 creates lib/supabase/pgvector.ts** — P2 will import from it in T2-04. P2 will stub it until P3 ships.
4. **Commit often** — each session commits its own files. No merge conflicts if ownership is respected.
5. **Check docs/STANDUPS/2026-04-21.md** to see what P2 has already done and not duplicate it.
