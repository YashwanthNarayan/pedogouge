# Deploy Runbook

## Prerequisites
- Vercel CLI: `npm i -g vercel`
- Fly CLI: `curl -L https://fly.io/install.sh | sh`
- Supabase CLI: `brew install supabase/tap/supabase`
- All env vars populated in `.env.local` (copy from `.env.example`)

---

## 1. Run migrations

```bash
supabase db push --db-url "$DATABASE_URL"
```

Verify: `supabase db diff` should show no pending changes.

---

## 2. Deploy Supabase Edge Functions

```bash
supabase functions deploy sm2-notify --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy audio-purge --project-ref "$SUPABASE_PROJECT_REF"
```

Set secrets once per function (if not already set):
```bash
supabase secrets set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" --project-ref "$SUPABASE_PROJECT_REF"
supabase secrets set EXPO_ACCESS_TOKEN="$EXPO_ACCESS_TOKEN" --project-ref "$SUPABASE_PROJECT_REF"
```

---

## 3. Build and type-check

```bash
pnpm i --frozen-lockfile
pnpm typecheck
pnpm test
```

All tests must pass before deploying.

---

## 4. Deploy defense-ws to Fly.io

```bash
cd infra/defense-ws
npm run build
fly deploy --config fly.toml
```

Verify the machine is healthy:
```bash
fly status --app pedagogue-defense-ws
```

Set secrets on Fly if not already set:
```bash
fly secrets set \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" \
  ELEVENLABS_VOICE_ID="$ELEVENLABS_VOICE_ID" \
  DEEPGRAM_API_KEY="$DEEPGRAM_API_KEY" \
  SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  SUPABASE_JWT_SECRET="$SUPABASE_JWT_SECRET" \
  DEFENSE_WS_SECRET="$DEFENSE_WS_SECRET" \
  WEB_APP_URL="$NEXT_PUBLIC_APP_URL" \
  --app pedagogue-defense-ws
```

---

## 5. Deploy Yjs relay to Fly.io

```bash
cd infra/y-websocket
fly deploy
```

---

## 6. Deploy Next.js to Vercel

```bash
vercel --prod
```

Or push to `main` — Vercel CI picks it up automatically via GitHub integration.

Set all env vars from `.env.example` in Vercel dashboard under Project → Settings → Environment Variables.

---

## 7. Smoke-test production

```bash
curl https://pedagogue.app/api/health
# Expected: {"status":"ok"}

curl -I wss://pedagogue-defense-ws.fly.dev
# Expected: HTTP 101 Switching Protocols (or 400 Missing token — means server is up)
```

---

## 8. Rollback procedure

**Next.js (Vercel):** Go to Vercel dashboard → Deployments → find last known-good deploy → Promote to Production.

**defense-ws (Fly.io):**
```bash
fly releases list --app pedagogue-defense-ws
fly deploy --image <previous-image-ref> --app pedagogue-defense-ws
```

**Supabase migrations:** Cannot be automatically rolled back. Prepare a down migration script and apply manually via `supabase db execute`.
