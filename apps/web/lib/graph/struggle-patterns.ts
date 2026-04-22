// ---------------------------------------------------------------------------
// Struggle Pattern Detector — rule-based classifier over the event window
//
// Patterns per plan P2 §F and Appendix B3:
//   conceptual_gap  — same error signature repeated ≥3 times without fix
//   integration     — alternating errors across 2+ distinct concepts in 5 min
//   surface_fix     — mastery briefly rose by ≥0.3 then dropped by ≥0.2
//   none            — not enough signal to classify
// ---------------------------------------------------------------------------

export type StrugglePattern = "none" | "conceptual_gap" | "integration" | "surface_fix";

// ---------------------------------------------------------------------------
// Event shape (mirrors events table payload_json)
// ---------------------------------------------------------------------------

export interface ConceptEvent {
  kind: string;       // "stderr_narrated" | "test_fail" | "mastery_update" | etc.
  ts: string;         // ISO-8601
  conceptId?: string;
  stderrHash?: string;  // sha256(normalised stderr) for identity comparison
  masteryScore?: number;
}

// ---------------------------------------------------------------------------
// Loader stub (P3 T3-01 replaces with real Supabase fetch)
// ---------------------------------------------------------------------------

export async function loadRecentEvents(
  _sessionId: string,
  _opts: { conceptId?: string; limit?: number },
): Promise<ConceptEvent[]> {
  // TODO (P3 T3-01): SELECT * FROM events WHERE session_id = $1 [AND concept_id = $2]
  // ORDER BY ts DESC LIMIT $3
  return [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count events with identical stderr hash (normalized error identity). */
function countIdenticalStderr(events: ConceptEvent[], targetHash: string): number {
  return events.filter(
    (e) => e.kind === "stderr_narrated" && e.stderrHash === targetHash,
  ).length;
}

/** Check whether errors alternate across 2+ distinct concepts within a time window (ms). */
function alternatesAcrossConcepts(
  events: ConceptEvent[],
  minDistinctConcepts: number,
  windowMs: number,
): boolean {
  if (events.length < 2) return false;
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = events.filter((e) => new Date(e.ts).getTime() >= cutoff && e.conceptId);
  const distinctConcepts = new Set(recent.map((e) => e.conceptId));
  return distinctConcepts.size >= minDistinctConcepts;
}

/** Detect mastery spike-then-drop pattern (surface fix that didn't stick). */
function masteryRoseAndDropped(
  events: ConceptEvent[],
  riseThreshold: number,
  dropThreshold: number,
): boolean {
  const masteryEvents = events
    .filter((e) => e.kind === "mastery_update" && e.masteryScore !== undefined)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  if (masteryEvents.length < 3) return false;

  for (let i = 1; i < masteryEvents.length - 1; i++) {
    const prev = masteryEvents[i - 1]!.masteryScore!;
    const peak = masteryEvents[i]!.masteryScore!;
    const curr = masteryEvents[i + 1]!.masteryScore!;
    if (peak - prev >= riseThreshold && peak - curr >= dropThreshold) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pure classifier — operates on pre-loaded events (testable without mocks)
// ---------------------------------------------------------------------------

export function classifyEventsAsStrugglePattern(events: ConceptEvent[]): StrugglePattern {
  if (events.length === 0) return "none";

  // surface_fix: mastery oscillated — tried to patch but understanding didn't stick
  if (masteryRoseAndDropped(events, 0.3, 0.2)) {
    return "surface_fix";
  }

  // integration: errors bouncing between multiple concepts in past 5 min
  if (alternatesAcrossConcepts(events, 2, 5 * 60 * 1000)) {
    return "integration";
  }

  // conceptual_gap: same error seen ≥3 times
  const hashCounts = new Map<string, number>();
  for (const e of events) {
    if (e.kind === "stderr_narrated" && e.stderrHash) {
      hashCounts.set(e.stderrHash, (hashCounts.get(e.stderrHash) ?? 0) + 1);
    }
  }
  const maxCount = Math.max(0, ...hashCounts.values());
  if (maxCount >= 3) {
    return "conceptual_gap";
  }

  return "none";
}

// ---------------------------------------------------------------------------
// Async wrapper — loads events then delegates to pure classifier
// ---------------------------------------------------------------------------

export async function detectStrugglePattern(
  sessionId: string,
  conceptId: string,
): Promise<StrugglePattern> {
  const events = await loadRecentEvents(sessionId, { conceptId, limit: 12 });
  return classifyEventsAsStrugglePattern(events);
}

// ---------------------------------------------------------------------------
// Exported helpers (for tests)
// ---------------------------------------------------------------------------

export { countIdenticalStderr, alternatesAcrossConcepts, masteryRoseAndDropped };
