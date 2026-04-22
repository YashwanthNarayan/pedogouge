-- Migration 002: users, classes, class_memberships
-- Full RLS added in T3-02 (020_rls_policies.sql)

create table users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  github_id text unique,
  display_name text,
  role text not null check (role in ('student', 'teacher')) default 'student',
  birthdate date not null,           -- age gate: must be >= 16 at signup
  expo_push_token text,
  created_at timestamptz default now(),
  deleted_at timestamptz             -- soft delete
);

create table classes (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references users(id),
  name text not null,
  github_classroom_url text,
  created_at timestamptz default now()
);

create table class_memberships (
  class_id uuid references classes(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text not null check (role in ('student', 'teacher', 'ta')),
  -- Classroom-visibility consent (loose scope) — required before teacher can read student data
  visibility_accepted_at timestamptz,
  visibility_consent_version text,   -- sha256 of the exact consent text shown (plan P.6)
  visibility_revoked_at timestamptz,
  joined_at timestamptz default now(),
  primary key (class_id, user_id)
);
