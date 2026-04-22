# /sync — Sync monorepo, regen schemas, apply migrations

Pull latest from main, install dependencies, regenerate JSON schemas from zod, and report what changed since last sync.

```bash
export PNPM_HOME="/Users/yashwanth/Library/pnpm"; export PATH="$PNPM_HOME:$PATH"
git pull origin main --rebase
pnpm install
pnpm gen:schemas
git diff --stat HEAD~1 HEAD -- packages/shared/src/
```

Report:
1. Any new migration files added since last sync
2. Any schema changes in packages/shared/src/
3. Any new env vars added to .env.example
4. Current state of pnpm test (run `pnpm test --reporter=verbose 2>&1 | tail -20`)

If conflicts were found in CLAUDE.md or packages/shared/, flag them immediately — do NOT resolve silently.
