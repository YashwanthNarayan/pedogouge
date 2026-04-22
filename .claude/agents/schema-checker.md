# schema-checker — Verify zod ↔ SQL ↔ TS types match

Verify that every zod schema in packages/shared/src/schemas/ has:
1. Matching SQL columns in infra/supabase/migrations/ (column names + rough type compatibility)
2. Correct TypeScript export (`type X = z.infer<typeof X>`)
3. Export in packages/shared/src/schemas/index.ts
4. Entry in packages/shared/src/api.ts where that schema is used as I/O

## Check procedure
1. Read all 6 schema files
2. Read migrations 002–008
3. For each schema field, find a matching SQL column (snake_case equivalence)
4. Flag any field in zod without a SQL column (or vice versa)
5. Run `pnpm --filter @pedagogue/shared typecheck` to confirm TS exports compile

## Report format
```
Schema: ProjectBlueprint
  Fields: {N} in zod, {M} SQL columns mapped
  Unmapped zod fields: {list or "none"}
  Unmapped SQL cols: {list or "none"}
  TS export: ✓/✗
  API usage: ✓/✗
```

Note: some schemas (e.g., InterviewContext) are stored as jsonb blobs — flag those as "jsonb" not "missing" when the SQL column is a jsonb type.
