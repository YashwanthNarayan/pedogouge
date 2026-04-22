-- Migration 003: sessions, concept_nodes, concept_edges
-- HNSW index on concept_nodes.embedding (m=16, ef_construction=64 per plan)

create table sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  class_id uuid references classes(id),
  project_idea text not null,
  blueprint_json jsonb,
  workspace_root text,
  edit_signing_key text,             -- per-session HMAC key for remote edits (plan P.3)
  credential_url text,
  yjs_room_id uuid default uuid_generate_v4(),
  created_at timestamptz default now(),
  finalized_at timestamptz,
  deleted_at timestamptz
);

create table concept_nodes (
  id text not null,
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  prerequisites text[] default '{}',
  mastery_score numeric(4, 3) not null default 0
    check (mastery_score >= 0 and mastery_score <= 1),
  decay_rate numeric(4, 3) not null default 0.1,
  last_tested_at timestamptz,
  related_errors text[] default '{}',
  struggle_pattern text
    check (struggle_pattern in ('none', 'conceptual_gap', 'integration', 'surface_fix'))
    default 'none',
  x real,
  y real,
  embedding halfvec(1024),
  primary key (session_id, id)
);

create index idx_concept_nodes_embedding
  on concept_nodes using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

create table concept_edges (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  from_node text not null,
  to_node text not null,
  unique (session_id, from_node, to_node)
);
