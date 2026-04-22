-- Migration 006: lessons, interventions, sm2_schedule

create table lessons (
  id uuid primary key default uuid_generate_v4(),
  concept_id text not null,
  body_md text not null,
  citations_json jsonb,
  starter_repo_git_sha text,
  tests_json jsonb,
  metadata_json jsonb,
  created_at timestamptz default now()
);
create index idx_lessons_concept_id on lessons(concept_id);

create table interventions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  concept_id text not null,
  tier integer not null check (tier between 1 and 5),
  content_md text,
  outcome text,
  delivery_channel text,
  ts timestamptz default now()
);

create table sm2_schedule (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  concept_id text not null,
  next_due_at timestamptz not null default now(),
  ease numeric(4, 3) not null default 2.5,
  interval_days numeric(8, 2) not null default 1,
  reps integer not null default 0,
  unique (user_id, concept_id)
);
create index idx_sm2_user_due on sm2_schedule(user_id, next_due_at);
