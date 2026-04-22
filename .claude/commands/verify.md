# /verify — Run verification checks for your package

Detect which package area you're working in from the current branch name prefix or last few git commits, then run the relevant slice of end-to-end checks from the plan §Verification (items #1–30).

```bash
export PNPM_HOME="/Users/yashwanth/Library/pnpm"; export PATH="$PNPM_HOME:$PATH"
git branch --show-current
git log --oneline -5
```

Map branch prefix to package checks:
- `ext/*` or `p1/*` → run: extension builds, `pnpm --filter pedagogue-extension typecheck`, check dist/ exists
- `ai/*` or `p2/*` → run: `pnpm --filter @pedagogue/web typecheck`, schema roundtrip tests
- `infra/*` or `p3/*` → run: `pnpm test:rls`, migration syntax check

For all packages: run `pnpm --filter @pedagogue/shared test` (shared schema tests always apply).

Report:
- Which checks passed ✓
- Which checks failed ✗ with the exact error
- Which checks are blocked (upstream dependency not yet implemented)

Do not mark a check as blocked if the underlying feature was supposed to land today.
