# ADR 003 — Loose Teacher Scope with Audit Log

**Status:** Accepted  
**Date:** 2026-04-21

## Context

Teachers need to monitor student progress to provide timely help. A strict permission model (teacher requests access per-file) would create too much friction and miss the real-time nature of pair programming. But unrestricted surveillance of minors is a privacy concern, especially under FERPA.

## Decision

Use "loose scope": teachers in a class can read all session data for students in that class by default. This mirrors physical classroom reality (teacher can see all student screens).

Mitigations:
- **Consent gate**: explicit blocking checkbox at class-join, not buried in TOS
- **Audit log**: every teacher read auto-inserts to `teacher_view_audit` via API middleware
- **Student visibility**: students can see their own audit log at `Settings → Who viewed my work`
- **Leave revocation**: class-leave immediately revokes teacher access to future data; `visibility_revoked_at` is set

What teachers CAN read: code (live + historical), diagnostics, interventions, defense transcripts, execution runs.  
What teachers CANNOT read: SM-2 personal schedule, Memory Store profile entries.  
What teachers CANNOT do: edit student code, issue credentials on the student's behalf.

## Consequences

- Consent UX is a hard blocker for class enrollment — cannot be skipped
- API middleware (`withTeacherAudit()`) must wrap every teacher-scope query
- `teacher_view_audit` is append-only, service-role only — students can read their own rows
- RLS `is_teacher_of_class()` function checks both teacher membership AND that the specific student has `visibility_accepted_at IS NOT NULL` and `visibility_revoked_at IS NULL`
- CI test suite asserts cross-class reads return 0 rows; within-class reads write audit rows
