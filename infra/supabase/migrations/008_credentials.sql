-- Migration 008: credentials, credential_audit
-- Ed25519-signed W3C Verifiable Credentials v2.0 (plan: NOT HMAC — we need third-party verify)

create table credentials (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  jwt text not null,
  radar_json jsonb,
  proof_of_struggle_json jsonb,
  vc_json jsonb not null,
  issued_at timestamptz default now(),
  revoked_at timestamptz,
  revocation_reason text
);

-- Append-only audit; written by service role only — no UPDATE/DELETE ever
create table credential_audit (
  id uuid primary key default uuid_generate_v4(),
  credential_id uuid not null references credentials(id),
  user_id uuid references users(id),
  action text not null check (action in ('issued', 'verified', 'revoked', 'verify_failed')),
  signer_kid text,
  hash_of_subject text,
  ts timestamptz default now()
);
