-- Migration 004: knowledge base chunks (global, seeded once)
-- Voyage voyage-code-3 embeddings, halfvec(1024), HNSW index

create table kb_chunks (
  id uuid primary key default uuid_generate_v4(),
  concept_id text not null,
  body_md text not null,
  embedding halfvec(1024),
  source_url text,
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz default now()
);

create index idx_kb_chunks_embedding
  on kb_chunks using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

create index idx_kb_chunks_concept_id on kb_chunks(concept_id);

-- match_chunks RPC added in T3-06 (030_match_chunks.sql)
