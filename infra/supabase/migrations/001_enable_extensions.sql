-- Migration 001: enable required Postgres extensions
-- Run: supabase db push (after supabase link)

create extension if not exists "uuid-ossp";
create extension if not exists "vector";        -- pgvector with halfvec support
create extension if not exists "pgcrypto";
create extension if not exists "pg_net";        -- async HTTP from triggers/functions
create extension if not exists "pg_cron";       -- cron jobs inside Postgres
