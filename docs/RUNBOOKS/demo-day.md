# Demo Day Runbook

Run through this checklist in order before the demo starts. Allow 30 minutes.

---

## 1. Seed demo data

```bash
pnpm seed:demo
```

This creates a demo user, class, session, concept graph, and pre-scored SM-2 schedule in Supabase. Verify it prints "Seeded demo session: <uuid>" with no errors.

---

## 2. Verify all services are up

```bash
# Next.js / Vercel
curl https://pedagogue.app/api/health

# defense-ws
curl -s -o /dev/null -w "%{http_code}" https://pedagogue-defense-ws.fly.dev/health || \
  echo "Expected 200 or 404 — means process is running"

# Supabase
curl "https://<project-ref>.supabase.co/rest/v1/" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" | jq .
```

---

## 3. Open the student flow in a browser

1. Navigate to `https://pedagogue.app`
2. Sign in with the demo student account (credentials in 1Password → "Pedagogue Demo")
3. Open the demo session
4. Confirm the VS Code extension connects (look for `@tutor` in the Chat panel)

---

## 4. Trigger a live intake

In the session page, click "Start" to kick off intake. Confirm:
- Blueprint appears in the session sidebar within ~10 seconds
- Concept graph renders (at least 3 nodes visible)

---

## 5. Demonstrate a tutor interaction

Type a question in the VS Code chat participant: `@tutor How do I write a for loop?`

Expected: Haiku responds with a hint, not a complete solution.

---

## 6. Trigger code execution

Submit a code snippet via the "Run" button (or `@tutor run`). Confirm Judge0 returns output within 5 seconds.

---

## 7. Start the defense

Navigate to the Defense tab. Click "Begin Defense." Confirm:
- Browser requests microphone permission
- "Connecting…" transitions to "Ready" within 3 seconds
- Interviewer speaks the opening question (ElevenLabs TTS audio plays)

---

## 8. Run through all three defense phases

Complete at least one exchange per phase:
- **Phase 1 Blueprint Interrogation**: answer a question about the blueprint discrepancy
- **Phase 2 Bug Injection**: identify and explain the injected bug
- **Phase 3 Counterfactuals**: answer one scaling/extension question

Confirm tool calls appear in browser dev tools (Network → WS → `tool_call` messages).

---

## 9. Issue a credential

After the defense completes, click "Issue Credential." Confirm:
- Credential page loads at `/credential/<id>`
- QR code is visible and scans to the credential URL
- "Verify" button calls the public verify endpoint and returns `{ valid: true }`

---

## 10. Show the teacher view

Sign in as the demo teacher in a second browser tab. Open the class dashboard. Confirm:
- Demo student appears in the roster
- Mastery scores are visible
- Defense status shows "complete"

---

## Contingency

| Issue | Fix |
|---|---|
| defense-ws not connecting | `fly restart --app pedagogue-defense-ws` |
| ElevenLabs silent | Check `ELEVENLABS_API_KEY` secret on Fly; verify voice ID is valid |
| Judge0 timeout | Switch to fallback: set `PEDAGOGUE_MOCK_EXECUTE=true` in Vercel and redeploy |
| Supabase 503 | Check Supabase status page; use cached demo video as fallback |
| Credential invalid | Re-generate keypair: `pnpm --filter @pedagogue/web credential:keygen`; update Vercel env |
