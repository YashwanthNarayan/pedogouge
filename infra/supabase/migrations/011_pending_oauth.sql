-- Migration 011: pending_oauth_states
-- Short-lived PKCE state store for the VS Code extension OAuth handshake.
-- Rows expire after 10 minutes; a pg_cron job or Edge Function sweeps them.

create table pending_oauth_states (
  state           text primary key,
  code_challenge  text not null,      -- SHA-256 of the PKCE verifier (base64url)
  pedagogue_token text,               -- set after GitHub callback completes
  user_id         uuid references users(id),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '10 minutes')
);

-- Index to efficiently purge expired rows
create index idx_pending_oauth_expires on pending_oauth_states(expires_at);
