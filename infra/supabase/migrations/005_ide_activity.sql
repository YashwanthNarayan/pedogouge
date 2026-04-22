-- Migration 005: editor_snapshots (hash-chained), ast_diagnostics, terminal_commands,
-- execution_runs, events
-- Snapshot chain enforced by trigger (plan P.7)

create table editor_snapshots (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  ts timestamptz not null default now(),
  files_json jsonb not null,
  diff_from_prev jsonb,
  prev_hash text not null default '',
  this_hash text not null,
  unique (session_id, this_hash)
);
create index idx_editor_snapshots_session_ts on editor_snapshots(session_id, ts);

-- Trigger enforces Merkle-style snapshot chain (plan P.7)
create or replace function verify_snapshot_chain() returns trigger as $$
declare
  expected_prev text;
begin
  select this_hash into expected_prev
  from editor_snapshots
  where session_id = new.session_id
  order by ts desc
  limit 1;

  if expected_prev is null then
    if new.prev_hash <> '' then
      raise exception 'first snapshot must have empty prev_hash';
    end if;
  elsif new.prev_hash <> expected_prev then
    raise exception 'snapshot chain broken: expected %, got %', expected_prev, new.prev_hash;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger snapshot_chain_check
before insert on editor_snapshots
for each row execute function verify_snapshot_chain();

create table ast_diagnostics (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  ts timestamptz not null default now(),
  file text not null,
  line integer not null,
  column_num integer not null,
  rule_id text not null,
  severity text not null,
  message text not null,
  concept_id text not null
);

create table terminal_commands (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  ts timestamptz not null default now(),
  cmd text not null,
  exit_code integer,
  stdout_tail text,
  stderr_tail text
);

create table execution_runs (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  judge0_token text,
  lang_id integer,
  test_results_json jsonb,
  stderr text,
  source text check (source in ('local', 'judge0')),
  submitted_at timestamptz default now(),
  finished_at timestamptz
);

create table events (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  ts timestamptz not null default now(),
  kind text not null,
  payload_json jsonb
);
create index idx_events_session_ts on events(session_id, ts desc);
