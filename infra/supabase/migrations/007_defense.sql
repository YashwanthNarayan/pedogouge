-- Migration 007: defense_sessions, defense_turns

create table defense_sessions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  phase text check (phase in ('blueprint_interrogation', 'bug_injection', 'counterfactual', 'complete'))
    default 'blueprint_interrogation',
  started_at timestamptz default now(),
  completed_at timestamptz,
  overall_rubric_json jsonb
);

create table defense_turns (
  id uuid primary key default uuid_generate_v4(),
  defense_session_id uuid not null references defense_sessions(id) on delete cascade,
  phase text not null,
  role text not null check (role in ('student', 'interviewer')),
  text text,
  audio_url text,
  tool_calls_json jsonb,
  ts timestamptz default now()
);
create index idx_defense_turns_session on defense_turns(defense_session_id, ts);
