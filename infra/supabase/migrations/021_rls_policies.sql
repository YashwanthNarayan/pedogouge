-- Migration 021: Full RLS policy matrix
-- Helpers: is_teacher_of_class(uuid), has_visibility_consent(uuid,uuid) — see 020_rls_helpers.sql
-- Service role always bypasses RLS; these policies govern authenticated users only.

-- ── users ───────────────────────────────────────────────────────────────────────
alter table users enable row level security;

create policy "users_select_own"
  on users for select
  using (id = auth.uid());

create policy "users_update_own"
  on users for update
  using (id = auth.uid());

-- ── classes ─────────────────────────────────────────────────────────────────────
alter table classes enable row level security;

create policy "classes_select_member"
  on classes for select
  using (
    exists (
      select 1 from class_memberships
      where class_id = classes.id
        and user_id  = auth.uid()
    )
  );

create policy "classes_insert_teacher"
  on classes for insert
  with check (
    exists (
      select 1 from users
      where id   = auth.uid()
        and role = 'teacher'
    )
  );

create policy "classes_update_teacher"
  on classes for update
  using (is_teacher_of_class(id));

-- ── class_memberships ──────────────────────────────────────────────────────────
alter table class_memberships enable row level security;

create policy "memberships_select_member"
  on class_memberships for select
  using (
    user_id = auth.uid()
    or is_teacher_of_class(class_id)
  );

-- Teachers/TAs add members; self-enrollment handled by server-side route
create policy "memberships_insert_teacher"
  on class_memberships for insert
  with check (is_teacher_of_class(class_id));

-- Allow student to update own consent columns (visibility_accepted_at, etc.)
create policy "memberships_update_own_consent"
  on class_memberships for update
  using (user_id = auth.uid());

-- ── sessions ──────────────────────────────────────────────────────────────────
alter table sessions enable row level security;

create policy "sessions_select_own"
  on sessions for select
  using (user_id = auth.uid());

create policy "sessions_select_teacher"
  on sessions for select
  using (
    class_id is not null
    and is_teacher_of_class(class_id)
    and has_visibility_consent(class_id, user_id)
  );

create policy "sessions_insert_own"
  on sessions for insert
  with check (user_id = auth.uid());

create policy "sessions_update_own"
  on sessions for update
  using (user_id = auth.uid());

-- ── concept_nodes ─────────────────────────────────────────────────────────────
alter table concept_nodes enable row level security;

create policy "concept_nodes_own_session"
  on concept_nodes for all
  using (
    exists (
      select 1 from sessions
      where id      = concept_nodes.session_id
        and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions
      where id      = concept_nodes.session_id
        and user_id = auth.uid()
    )
  );

-- ── concept_edges ─────────────────────────────────────────────────────────────
alter table concept_edges enable row level security;

create policy "concept_edges_own_session"
  on concept_edges for all
  using (
    exists (
      select 1 from sessions
      where id      = concept_edges.session_id
        and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions
      where id      = concept_edges.session_id
        and user_id = auth.uid()
    )
  );

-- ── kb_chunks ─────────────────────────────────────────────────────────────────
alter table kb_chunks enable row level security;

create policy "kb_chunks_select_authenticated"
  on kb_chunks for select
  using (auth.role() = 'authenticated');

-- ── editor_snapshots ──────────────────────────────────────────────────────────
alter table editor_snapshots enable row level security;

create policy "editor_snapshots_own_session"
  on editor_snapshots for select
  using (
    exists (
      select 1 from sessions
      where id      = editor_snapshots.session_id
        and user_id = auth.uid()
    )
  );

create policy "editor_snapshots_insert_own_session"
  on editor_snapshots for insert
  with check (
    exists (
      select 1 from sessions
      where id      = editor_snapshots.session_id
        and user_id = auth.uid()
    )
  );

-- ── ast_diagnostics ──────────────────────────────────────────────────────────
alter table ast_diagnostics enable row level security;

create policy "ast_diagnostics_own_session"
  on ast_diagnostics for select
  using (
    exists (
      select 1 from sessions
      where id      = ast_diagnostics.session_id
        and user_id = auth.uid()
    )
  );

create policy "ast_diagnostics_insert_own_session"
  on ast_diagnostics for insert
  with check (
    exists (
      select 1 from sessions
      where id      = ast_diagnostics.session_id
        and user_id = auth.uid()
    )
  );

-- ── terminal_commands ─────────────────────────────────────────────────────────
alter table terminal_commands enable row level security;

create policy "terminal_commands_own_session"
  on terminal_commands for select
  using (
    exists (
      select 1 from sessions
      where id      = terminal_commands.session_id
        and user_id = auth.uid()
    )
  );

create policy "terminal_commands_insert_own_session"
  on terminal_commands for insert
  with check (
    exists (
      select 1 from sessions
      where id      = terminal_commands.session_id
        and user_id = auth.uid()
    )
  );

-- ── execution_runs ────────────────────────────────────────────────────────────
alter table execution_runs enable row level security;

create policy "execution_runs_own_session"
  on execution_runs for select
  using (
    exists (
      select 1 from sessions
      where id      = execution_runs.session_id
        and user_id = auth.uid()
    )
  );

create policy "execution_runs_insert_own_session"
  on execution_runs for insert
  with check (
    exists (
      select 1 from sessions
      where id      = execution_runs.session_id
        and user_id = auth.uid()
    )
  );

-- ── events ────────────────────────────────────────────────────────────────────
alter table events enable row level security;

create policy "events_own_session"
  on events for select
  using (
    exists (
      select 1 from sessions
      where id      = events.session_id
        and user_id = auth.uid()
    )
  );

create policy "events_insert_own_session"
  on events for insert
  with check (
    exists (
      select 1 from sessions
      where id      = events.session_id
        and user_id = auth.uid()
    )
  );

-- ── lessons ───────────────────────────────────────────────────────────────────
alter table lessons enable row level security;

create policy "lessons_select_authenticated"
  on lessons for select
  using (auth.role() = 'authenticated');

-- ── interventions ─────────────────────────────────────────────────────────────
alter table interventions enable row level security;

create policy "interventions_own_session"
  on interventions for all
  using (
    exists (
      select 1 from sessions
      where id      = interventions.session_id
        and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions
      where id      = interventions.session_id
        and user_id = auth.uid()
    )
  );

-- ── sm2_schedule ──────────────────────────────────────────────────────────────
alter table sm2_schedule enable row level security;

create policy "sm2_own_user"
  on sm2_schedule for select
  using (user_id = auth.uid());

create policy "sm2_update_own"
  on sm2_schedule for update
  using (user_id = auth.uid());

create policy "sm2_insert_own"
  on sm2_schedule for insert
  with check (user_id = auth.uid());

-- ── defense_sessions ──────────────────────────────────────────────────────────
alter table defense_sessions enable row level security;

create policy "defense_sessions_own_session"
  on defense_sessions for select
  using (
    exists (
      select 1 from sessions
      where id      = defense_sessions.session_id
        and user_id = auth.uid()
    )
  );

create policy "defense_sessions_insert_own_session"
  on defense_sessions for insert
  with check (
    exists (
      select 1 from sessions
      where id      = defense_sessions.session_id
        and user_id = auth.uid()
    )
  );

-- ── defense_turns ─────────────────────────────────────────────────────────────
alter table defense_turns enable row level security;

create policy "defense_turns_own_defense_session"
  on defense_turns for select
  using (
    exists (
      select 1 from defense_sessions ds
      join sessions s on s.id = ds.session_id
      where ds.id     = defense_turns.defense_session_id
        and s.user_id = auth.uid()
    )
  );

create policy "defense_turns_insert_own_defense_session"
  on defense_turns for insert
  with check (
    exists (
      select 1 from defense_sessions ds
      join sessions s on s.id = ds.session_id
      where ds.id     = defense_turns.defense_session_id
        and s.user_id = auth.uid()
    )
  );

-- ── credentials ───────────────────────────────────────────────────────────────
-- Public SELECT (credentials are verifiable by anyone who has the UUID)
alter table credentials enable row level security;

create policy "credentials_select_public"
  on credentials for select
  using (true);

create policy "credentials_insert_own_session"
  on credentials for insert
  with check (
    exists (
      select 1 from sessions
      where id      = credentials.session_id
        and user_id = auth.uid()
    )
  );

-- credential_audit is append-only via service role; no user policies
alter table credential_audit enable row level security;

-- ── yjs_docs ──────────────────────────────────────────────────────────────────
alter table yjs_docs enable row level security;

create policy "yjs_docs_own_room"
  on yjs_docs for select
  using (
    exists (
      select 1 from sessions
      where yjs_room_id = yjs_docs.room_id
        and user_id     = auth.uid()
    )
  );

create policy "yjs_docs_update_own_room"
  on yjs_docs for update
  using (
    exists (
      select 1 from sessions
      where yjs_room_id = yjs_docs.room_id
        and user_id     = auth.uid()
    )
  );

-- y-websocket server writes via service role on connect
create policy "yjs_docs_insert_own_room"
  on yjs_docs for insert
  with check (
    exists (
      select 1 from sessions
      where yjs_room_id = yjs_docs.room_id
        and user_id     = auth.uid()
    )
  );

-- ── teacher_nudges ────────────────────────────────────────────────────────────
alter table teacher_nudges enable row level security;

create policy "teacher_nudges_select_recipient"
  on teacher_nudges for select
  using (
    exists (
      select 1 from sessions
      where id      = teacher_nudges.to_session
        and user_id = auth.uid()
    )
  );

create policy "teacher_nudges_insert_teacher"
  on teacher_nudges for insert
  with check (
    from_user = auth.uid()
    and is_teacher_of_class(
      (select class_id from sessions where id = teacher_nudges.to_session)
    )
  );

-- ── teacher_view_audit ────────────────────────────────────────────────────────
-- Append-only by service role; students can read their own rows
alter table teacher_view_audit enable row level security;

create policy "teacher_view_audit_select_own"
  on teacher_view_audit for select
  using (student_id = auth.uid());

-- ── security_events ───────────────────────────────────────────────────────────
-- Append-only; service role only writes; no user reads
alter table security_events enable row level security;

-- ── usage_records ─────────────────────────────────────────────────────────────
-- Append-only; service role only; no user reads
alter table usage_records enable row level security;

-- ── user_memories ─────────────────────────────────────────────────────────────
alter table user_memories enable row level security;

create policy "user_memories_own"
  on user_memories for select
  using (user_id = auth.uid());

create policy "user_memories_insert_own"
  on user_memories for insert
  with check (user_id = auth.uid());

create policy "user_memories_update_own"
  on user_memories for update
  using (user_id = auth.uid());

-- ── pending_oauth_states ──────────────────────────────────────────────────────
-- Written by the server (service role); user reads own row to complete handshake
alter table pending_oauth_states enable row level security;

create policy "pending_oauth_select_own"
  on pending_oauth_states for select
  using (user_id = auth.uid());
