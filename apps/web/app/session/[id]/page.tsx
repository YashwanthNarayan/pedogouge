import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpenInVSCode } from "./open-in-vscode";

// ---------------------------------------------------------------------------
// Types (mirrors DB rows until Supabase client ships in T3-01)
// ---------------------------------------------------------------------------

interface ConceptNode {
  id: string;
  name: string;
  mastery_score: number;
  prerequisites: string[];
  struggle_pattern: "none" | "conceptual_gap" | "integration" | "surface_fix";
  x?: number;
  y?: number;
}

interface Session {
  id: string;
  project_idea: string;
  blueprint_json: {
    title: string;
    summary: string;
    recommendedLanguage: string;
    conceptGraph?: { id: string; name: string }[];
  } | null;
  created_at: string;
  finalized_at: string | null;
}

// ---------------------------------------------------------------------------
// Stub data loader (P3 replaces with real Supabase query in T3-01)
// ---------------------------------------------------------------------------

async function loadSession(id: string): Promise<Session | null> {
  // TODO (P3 T3-01): SELECT sessions WHERE id = $1, join concept_nodes
  void id;
  return null;
}

async function loadConceptNodes(_sessionId: string): Promise<ConceptNode[]> {
  // TODO (P3 T3-01): SELECT concept_nodes WHERE session_id = $1
  return [];
}

// ---------------------------------------------------------------------------
// Mastery colour helper
// ---------------------------------------------------------------------------

function masteryColor(score: number): string {
  if (score >= 0.8) return "#16a34a";
  if (score >= 0.5) return "#ca8a04";
  if (score >= 0.2) return "#ea580c";
  return "#dc2626";
}

// ---------------------------------------------------------------------------
// Aggregate mastery summary
// ---------------------------------------------------------------------------

function AggregateMastery({ nodes }: { nodes: ConceptNode[] }) {
  if (nodes.length === 0) return null;
  const mastered = nodes.filter((n) => n.mastery_score >= 0.6).length;
  const pct = Math.round((mastered / nodes.length) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: `conic-gradient(#16a34a ${pct}%, #e5e7eb 0)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 600,
          color: "#111827",
        }}
      >
        {pct}%
      </div>
      <div>
        <div style={{ fontWeight: 600, color: "#111827" }}>
          {mastered}/{nodes.length} concepts mastered
        </div>
        <div style={{ fontSize: 13, color: "#6b7280" }}>≥ 60% mastery threshold</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concept list
// ---------------------------------------------------------------------------

function ConceptList({
  nodes,
  sessionId,
}: {
  nodes: ConceptNode[];
  sessionId: string;
}) {
  if (nodes.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: 14 }}>
        Concept graph loading — run intake first via @tutor in VS Code.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {nodes.map((node) => (
        <Link
          key={node.id}
          href={`/session/${sessionId}/lesson/${node.id}`}
          style={{ textDecoration: "none" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 16px",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
              transition: "box-shadow 0.15s",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: masteryColor(node.mastery_score),
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, color: "#111827", fontSize: 14 }}>
                {node.name}
              </div>
              {node.struggle_pattern !== "none" && (
                <div style={{ fontSize: 12, color: "#ef4444" }}>
                  ⚠ {node.struggle_pattern.replace("_", " ")}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 120,
                  height: 6,
                  borderRadius: 3,
                  background: "#e5e7eb",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round(node.mastery_score * 100)}%`,
                    height: "100%",
                    background: masteryColor(node.mastery_score),
                    borderRadius: 3,
                    transition: "width 0.5s",
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: "#6b7280", width: 32, textAlign: "right" }}>
                {Math.round(node.mastery_score * 100)}%
              </span>
            </div>
            <span style={{ color: "#9ca3af", fontSize: 12 }}>→</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Defense readiness gate (>70% of concepts at mastery > 0.6)
// ---------------------------------------------------------------------------

function DefenseReadiness({
  nodes,
  sessionId,
}: {
  nodes: ConceptNode[];
  sessionId: string;
}) {
  if (nodes.length === 0) return null;
  const ready = nodes.filter((n) => n.mastery_score >= 0.6).length / nodes.length >= 0.7;
  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: 10,
        background: ready ? "#f0fdf4" : "#fafafa",
        border: `1px solid ${ready ? "#bbf7d0" : "#e5e7eb"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, color: ready ? "#15803d" : "#6b7280" }}>
          {ready ? "✓ Ready for voice defense" : "Keep practicing to unlock defense"}
        </div>
        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          {ready
            ? "≥70% of concepts mastered. You've earned it."
            : "Need ≥70% of concepts above 60% mastery."}
        </div>
      </div>
      {ready && (
        <a
          href={`/session/${sessionId}/defense`}
          style={{
            padding: "8px 16px",
            background: "#16a34a",
            color: "#fff",
            borderRadius: 6,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Start defense →
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SessionOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, nodes] = await Promise.all([loadSession(id), loadConceptNodes(id)]);

  // In dev/before P3 ships, show a demo shell rather than 404
  const isDev = process.env.NODE_ENV !== "production";
  if (!session && !isDev) notFound();

  const title = session?.blueprint_json?.title ?? "Habit Tracker with Streaks";
  const summary =
    session?.blueprint_json?.summary ??
    "Track daily habits, compute streaks, and motivate consistency.";
  const language = session?.blueprint_json?.recommendedLanguage ?? "python";

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 860,
        margin: "0 auto",
        padding: "40px 24px",
        color: "#111827",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#111827" }}>
              {title}
            </h1>
            <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>
              {summary}
            </p>
            <span
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: "2px 10px",
                background: "#eff6ff",
                color: "#1d4ed8",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {language}
            </span>
          </div>
          <OpenInVSCode sessionId={id} />
        </div>
      </div>

      {/* Mastery summary */}
      <section style={{ marginBottom: 28 }}>
        <Suspense fallback={null}>
          <AggregateMastery nodes={nodes} />
        </Suspense>
      </section>

      {/* Defense readiness */}
      <section style={{ marginBottom: 32 }}>
        <DefenseReadiness nodes={nodes} sessionId={id} />
      </section>

      {/* Concept graph */}
      <section style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: "0 0 12px",
            color: "#111827",
          }}
        >
          Skill Graph
        </h2>
        <ConceptList nodes={nodes} sessionId={id} />
        {nodes.length === 0 && isDev && (
          <div
            style={{
              padding: 20,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 8,
              fontSize: 13,
              color: "#92400e",
              marginTop: 12,
            }}
          >
            <strong>Dev mode:</strong> No concept nodes loaded. P3&apos;s Supabase migration (T3-01) will
            populate real data. The VS Code extension populates concept nodes after intake.
          </div>
        )}
      </section>

      {/* Footer nav */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 20 }}>
        <Link href="/" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>
          ← All sessions
        </Link>
      </div>
    </div>
  );
}
