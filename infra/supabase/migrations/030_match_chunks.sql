-- Migration 030: match_chunks RPC
-- Semantic KNN search over kb_chunks using pgvector HNSW index.
-- STABLE (no writes); granted to authenticated so the web client can call it directly.

create or replace function match_chunks(
  query_vec    halfvec(1024),
  k            integer  default 5,
  concept_filter text   default null,
  difficulty_filter text default null
)
returns table (
  id           uuid,
  concept_id   text,
  body_md      text,
  source_url   text,
  difficulty   text,
  similarity   float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    id,
    concept_id,
    body_md,
    source_url,
    difficulty,
    1 - (embedding <=> query_vec) as similarity
  from kb_chunks
  where
    (concept_filter   is null or concept_id = concept_filter)
    and (difficulty_filter is null or difficulty = difficulty_filter)
  order by embedding <=> query_vec
  limit k;
$$;

grant execute on function match_chunks(halfvec, integer, text, text) to authenticated;
