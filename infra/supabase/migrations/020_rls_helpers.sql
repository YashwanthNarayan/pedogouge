-- Migration 020: RLS helper functions
-- These are called from RLS policies (020_rls_policies.sql, T3-02).
-- SECURITY DEFINER so policies can bypass RLS on the membership table itself.

create or replace function is_teacher_of_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from class_memberships
    where class_id = p_class_id
      and user_id  = auth.uid()
      and role in ('teacher', 'ta')
  );
$$;

-- Grant execute to authenticated role so RLS policies can call it
grant execute on function is_teacher_of_class(uuid) to authenticated;

-- Visibility consent check: returns true if the student has granted (and not revoked)
-- classroom-visibility consent for the given class.
create or replace function has_visibility_consent(p_class_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from class_memberships
    where class_id               = p_class_id
      and user_id                = p_student_id
      and visibility_accepted_at is not null
      and visibility_revoked_at  is null
  );
$$;

grant execute on function has_visibility_consent(uuid, uuid) to authenticated;
