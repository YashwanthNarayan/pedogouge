# ADR 004 — Citations API Incompatible with JSON Structured Output

**Status:** Accepted  
**Date:** 2026-04-21

## Context

The curriculum generator needs to:
1. Produce lesson content grounded in KB chunks (requires Citations API for inline source attribution)
2. Return structured metadata: difficulty, prerequisiteConceptIds, runnableCells, estimatedMinutes (requires `response_format` JSON schema)

Anthropic's Citations API and JSON structured output (`response_format: { type: "json_schema" }`) cannot be used in the same API call. Citations requires `text/markdown` content; structured output enforces strict JSON. Using both results in a 400 error.

## Decision

Split into two API calls:

**Call 1 — Opus 4.7 + Citations API:** Generate the lesson body as Markdown with inline citation markers. Documents (KB chunks) attached as `type: "document"` blocks with `citations: { enabled: true }`. Returns Markdown with `<cite>` spans.

**Call 2 — Haiku 4.5 + structured output:** Feed the generated Markdown to Haiku and extract structured metadata (difficulty, prerequisites, runnable cells). Returns JSON only — no citations needed.

Total: 2 API calls per lesson. Call 2 is cheap (Haiku on short output).

## Consequences

- `lib/anthropic/curriculum.ts` must maintain two separate call paths
- The `callWithCitations()` helper in `lib/anthropic/client.ts` must NOT set `response_format`
- Lesson metadata is slightly delayed (waits for both calls) but this is acceptable since lessons are cached in the `lessons` table
- Cache: Call 1 caches the system prompt (1h) + KB chunks (5m). Call 2 caches only the system prompt since input is derived from call 1's output
- Test fixtures must include both a mock Citations response AND a mock metadata JSON response
