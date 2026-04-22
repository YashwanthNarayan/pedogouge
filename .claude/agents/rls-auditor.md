# rls-auditor — Audit RLS policies against the threat model

Given a SQL migration file (or the full schema), verify that the RLS policies match the matrix in plan P.2.

## How to use
Invoke via Agent tool with this agent. Pass the migration path in your prompt.

## What to check
For each table, run synthetic auth-as tests using Supabase's row-level security policies:

1. Authenticate as `student_a` (member of class X) — can they SELECT their own rows? ✓
2. Authenticate as `student_a` — can they SELECT student_b's rows (same class)? ✗ expected
3. Authenticate as `teacher_of_class_x` — can they SELECT student_a's rows? ✓ (loose scope)
4. Authenticate as `teacher_of_class_x` — can they SELECT student in class Y? ✗ expected
5. Authenticate as `teacher_of_class_x` — does a teacher_view_audit row get inserted? ✓

Report format:
```
Table: {name}
  student owns: {PASS|FAIL}
  peer blocked: {PASS|FAIL}
  teacher loose: {PASS|FAIL}
  teacher cross-class: {PASS|FAIL}
  audit logged: {PASS|FAIL|N/A}
```

Flag any FAIL immediately — it represents a data leak.

## Reference
Plan section P.2 (RLS matrix), plan P.2 is_teacher_of_class() definition.
Verification check #18 from plan §Verification.
