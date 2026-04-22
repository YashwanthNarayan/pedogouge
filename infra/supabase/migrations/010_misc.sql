-- Migration 010: teacher_view_audit, security_events, usage_records, user_memories
-- All append-only audit/telemetry tables; service role only for writes

-- Every teacher class-scope read must log here (plan P.2).
-- Students can query: SELECT * FROM teacher_view_audit WHERE student_id = auth.uid()
create table teacher_view_audit (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references users(id),
  student_id uuid not null references users(id),
  session_id uuid references sessions(id),
  table_read text not null,
  rows_returned integer not null,
  ts timestamptz default now()
);
create index idx_teacher_view_audit_student on teacher_view_audit(student_id, ts desc);

-- Security event log — never updated or deleted
create table security_events (
  id uuid primary key default uuid_generate_v4(),
  kind text not null,
  session_id uuid,
  user_id uuid,
  reason text not null,
  severity text check (severity in ('info', 'warn', 'error', 'critical')) default 'warn',
  ts timestamptz default now()
);

-- Per-call token accounting for cost auditing (plan P.12)
create table usage_records (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id),
  user_id uuid not null references users(id),
  model text not null,
  role text not null,
  input_tokens integer default 0,
  output_tokens integer default 0,
  cache_creation_tokens integer default 0,
  cache_read_tokens integer default 0,
  ts timestamptz default now()
);

-- Fallback when Anthropic Managed Agents Memory Stores unavailable (plan Appendix G)
create table user_memories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  value_json jsonb not null,
  updated_at timestamptz default now(),
  unique (user_id, key)
);
