-- Migration 009: yjs_docs, teacher_nudges
-- Fallback persistence for y-websocket; Broadcast channels handle real-time presence

create table yjs_docs (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null unique,
  doc_bytea bytea,
  updated_at timestamptz default now()
);

create table teacher_nudges (
  id uuid primary key default uuid_generate_v4(),
  from_user uuid not null references users(id),
  to_session uuid not null references sessions(id),
  kind text not null,
  payload_json jsonb,
  ts timestamptz default now()
);
