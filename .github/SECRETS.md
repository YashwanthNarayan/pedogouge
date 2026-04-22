# GitHub Actions Secrets

Add these secrets in **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Required by | Description |
|--------|-------------|-------------|
| `SUPABASE_URL` | `ci.yml` (test + build), `rls-tests.yml` | Project URL from Supabase dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | `ci.yml` (test + build) | Anon (public) key — safe to expose; used by browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | `rls-tests.yml` | Service role key — **never expose to browser**; backend only |

## How to add a secret

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter the name and value, then click **Add secret**

## Notes

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are used in CI for the unit test run and the
  Next.js build. The RLS tests skip automatically when the `rls-tests.yml` workflow is
  not triggered, so CI stays green without Supabase credentials — unit tests use vitest
  mocks only.
- `SUPABASE_SERVICE_ROLE_KEY` is only used by the weekly RLS matrix in `rls-tests.yml`,
  which is manual-trigger + scheduled. Never add it to the general CI workflow.
- All other secrets (Anthropic, Voyage, etc.) are injected by Vercel at deploy time and
  are not needed for CI.
